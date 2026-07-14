import type {
  ContractAnalysis,
  ContractRecord,
  RiskLevel,
  ScenarioInputs,
} from "../domain";
import { analyzeContract } from "./analysis";
import { clamp, finite, round, safeDivide, sum } from "./math";

export const MONTE_CARLO_ENGINE_VERSION = "1.0.0";
export const DEFAULT_MONTE_CARLO_SEED = 0x42494453;
export const DEFAULT_MONTE_CARLO_SAMPLE_COUNT = 500;

const MINIMUM_SAMPLE_COUNT = 100;
const MAXIMUM_SAMPLE_COUNT = 1_000;

export type MonteCarloDriver = keyof ScenarioInputs;

export interface MonteCarloDriverDistribution {
  /** Arithmetic mean of the scenario delta. */
  mean: number;
  /** Standard deviation; option overrides are multiplied before metadata output. */
  standardDeviation: number;
  /** Hard lower bound applied after sampling. */
  minimum: number;
  /** Hard upper bound applied after sampling. */
  maximum: number;
  /** Loading on the shared adverse factor, from -0.95 to 0.95. */
  systemicLoading: number;
}

export type MonteCarloDistributionOverrides = Partial<
  Record<MonteCarloDriver, Partial<MonteCarloDriverDistribution>>
>;

export interface MonteCarloSimulationOptions {
  /** Clamped to 100-1,000 so an interactive run remains responsive. */
  sampleCount?: number;
  /** Number or label used to reproduce the exact random stream. */
  seed?: number | string;
  /** Multiplies all standard deviations; clamped to 0-3. */
  uncertaintyMultiplier?: number;
  distributions?: MonteCarloDistributionOverrides;
}

export interface MonteCarloPercentiles {
  min: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  max: number;
  mean: number;
}

export interface MonteCarloRiskBucket {
  count: number;
  probabilityPct: number;
}

export interface MonteCarloSampleSummary {
  sampleIndex: number;
  scenario: ScenarioInputs;
  riskScore: number;
  riskLevel: RiskLevel;
  peakCashShortfallKrw: number;
  fundingRequirementKrw: number;
  survivalMarginKrw: number;
  survivalMarginPct: number;
  cashRunwayMonths: number;
}

export interface MonteCarloDriverSensitivity {
  driver: MonteCarloDriver;
  label: string;
  correlationToSurvivalMargin: number;
  correlationToFundingRequirement: number;
}

export interface MonteCarloSimulationMetadata {
  engineVersion: string;
  sampleCount: number;
  requestedSampleCount: number;
  seed: number;
  uncertaintyMultiplier: number;
  deterministic: true;
  distributions: Record<MonteCarloDriver, MonteCarloDriverDistribution>;
  correlationModel: string;
  worstSampleSelectionRule: string;
  caveats: string[];
}

export interface MonteCarloSimulationResult {
  contractId: string;
  baseline: ContractAnalysis;
  probabilities: {
    cashShortfallPct: number;
    negativeSurvivalMarginPct: number;
    highOrCriticalRiskPct: number;
  };
  fundingRequirementKrw: MonteCarloPercentiles;
  peakCashShortfallKrw: MonteCarloPercentiles;
  survivalMarginKrw: MonteCarloPercentiles;
  survivalMarginPct: MonteCarloPercentiles;
  riskScore: MonteCarloPercentiles;
  riskDistribution: Record<RiskLevel, MonteCarloRiskBucket>;
  sampledScenarios: Record<MonteCarloDriver, MonteCarloPercentiles>;
  worstSample: MonteCarloSampleSummary;
  driverSensitivity: MonteCarloDriverSensitivity[];
  metadata: MonteCarloSimulationMetadata;
}

const DRIVER_KEYS = [
  "costInflationPct",
  "paymentDelayDays",
  "interestRateChangePctPoints",
  "orderVolumeChangePct",
] as const satisfies readonly MonteCarloDriver[];

const DRIVER_LABELS: Record<MonteCarloDriver, string> = {
  costInflationPct: "원가 상승",
  paymentDelayDays: "대금 지급 지연",
  interestRateChangePctPoints: "금리 변화",
  orderVolumeChangePct: "수주 물량 변화",
};

const SCENARIO_LIMITS: Record<MonteCarloDriver, { minimum: number; maximum: number }> = {
  costInflationPct: { minimum: -50, maximum: 200 },
  paymentDelayDays: { minimum: -365, maximum: 365 },
  interestRateChangePctPoints: { minimum: -20, maximum: 30 },
  orderVolumeChangePct: { minimum: -100, maximum: 200 },
};

/**
 * Defaults are bounded stress assumptions, not forecasts. A positive shared
 * factor raises cost, delay and rates while reducing order volume, preserving
 * plausible co-movement without claiming an estimated causal relationship.
 */
export const DEFAULT_MONTE_CARLO_DISTRIBUTIONS: Readonly<
  Record<MonteCarloDriver, Readonly<MonteCarloDriverDistribution>>
> = Object.freeze({
  costInflationPct: Object.freeze({
    mean: 5,
    standardDeviation: 7,
    minimum: -10,
    maximum: 35,
    systemicLoading: 0.45,
  }),
  paymentDelayDays: Object.freeze({
    mean: 20,
    standardDeviation: 30,
    minimum: -30,
    maximum: 180,
    systemicLoading: 0.35,
  }),
  interestRateChangePctPoints: Object.freeze({
    mean: 0.75,
    standardDeviation: 1.5,
    minimum: -3,
    maximum: 7,
    systemicLoading: 0.55,
  }),
  orderVolumeChangePct: Object.freeze({
    mean: -2.5,
    standardDeviation: 10,
    minimum: -35,
    maximum: 20,
    systemicLoading: -0.25,
  }),
});

interface InternalSample extends MonteCarloSampleSummary {
  driverValues: ScenarioInputs;
}

function hashSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function normalizeSeed(seed: number | string | undefined): number {
  if (typeof seed === "number" && Number.isFinite(seed)) return Math.trunc(seed) >>> 0;
  if (typeof seed === "string" && seed.trim()) return hashSeed(seed.trim());
  return DEFAULT_MONTE_CARLO_SEED;
}

function normalizeSampleCount(value: number | undefined): {
  requested: number;
  effective: number;
} {
  const requested = Math.round(finite(value ?? DEFAULT_MONTE_CARLO_SAMPLE_COUNT, DEFAULT_MONTE_CARLO_SAMPLE_COUNT));
  return {
    requested,
    effective: Math.round(clamp(requested, MINIMUM_SAMPLE_COUNT, MAXIMUM_SAMPLE_COUNT)),
  };
}

function sanitizeDistributions(
  overrides: MonteCarloDistributionOverrides | undefined,
  uncertaintyMultiplier: number,
): Record<MonteCarloDriver, MonteCarloDriverDistribution> {
  return Object.fromEntries(
    DRIVER_KEYS.map((driver) => {
      const defaults = DEFAULT_MONTE_CARLO_DISTRIBUTIONS[driver];
      const override = overrides?.[driver];
      const limits = SCENARIO_LIMITS[driver];
      let minimum = clamp(
        finite(override?.minimum ?? defaults.minimum, defaults.minimum),
        limits.minimum,
        limits.maximum,
      );
      let maximum = clamp(
        finite(override?.maximum ?? defaults.maximum, defaults.maximum),
        limits.minimum,
        limits.maximum,
      );
      if (minimum > maximum) [minimum, maximum] = [maximum, minimum];

      const standardDeviation = clamp(
        finite(
          override?.standardDeviation ?? defaults.standardDeviation,
          defaults.standardDeviation,
        ) * uncertaintyMultiplier,
        0,
        limits.maximum - limits.minimum,
      );

      return [
        driver,
        {
          mean: clamp(
            finite(override?.mean ?? defaults.mean, defaults.mean),
            minimum,
            maximum,
          ),
          standardDeviation,
          minimum,
          maximum,
          systemicLoading: clamp(
            finite(override?.systemicLoading ?? defaults.systemicLoading, defaults.systemicLoading),
            -0.95,
            0.95,
          ),
        },
      ];
    }),
  ) as unknown as Record<MonteCarloDriver, MonteCarloDriverDistribution>;
}

/** Mulberry32 is small, fast and deterministic; it is not used for security. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

function createStandardNormal(random: () => number): () => number {
  let spare: number | undefined;
  return () => {
    if (spare !== undefined) {
      const value = spare;
      spare = undefined;
      return value;
    }

    // Box-Muller with an open interval avoids log(0).
    const first = Math.max(random(), Number.EPSILON);
    const second = random();
    const magnitude = Math.sqrt(-2 * Math.log(first));
    spare = magnitude * Math.sin(2 * Math.PI * second);
    return magnitude * Math.cos(2 * Math.PI * second);
  };
}

function sampleScenario(
  normal: () => number,
  distributions: Record<MonteCarloDriver, MonteCarloDriverDistribution>,
): ScenarioInputs {
  const systemicShock = normal();
  const entries = DRIVER_KEYS.map((driver) => {
    const distribution = distributions[driver];
    const loading = distribution.systemicLoading;
    const combinedShock =
      loading * systemicShock + Math.sqrt(1 - loading ** 2) * normal();
    const sampled = clamp(
      distribution.mean + distribution.standardDeviation * combinedShock,
      distribution.minimum,
      distribution.maximum,
    );
    return [driver, driver === "paymentDelayDays" ? round(sampled) : round(sampled, 2)];
  });
  return Object.fromEntries(entries) as unknown as ScenarioInputs;
}

function percentile(sortedValues: readonly number[], probability: number): number {
  if (sortedValues.length === 0) return 0;
  const position = clamp(probability, 0, 1) * (sortedValues.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sortedValues[lowerIndex];
  const upper = sortedValues[upperIndex];
  if (lowerIndex === upperIndex) return lower;
  return lower + (upper - lower) * (position - lowerIndex);
}

function summarize(values: readonly number[], digits = 0): MonteCarloPercentiles {
  const sorted = values.map((value) => finite(value)).sort((left, right) => left - right);
  const rounded = (value: number) => round(value, digits);
  return {
    min: rounded(sorted[0] ?? 0),
    p10: rounded(percentile(sorted, 0.1)),
    p25: rounded(percentile(sorted, 0.25)),
    p50: rounded(percentile(sorted, 0.5)),
    p75: rounded(percentile(sorted, 0.75)),
    p90: rounded(percentile(sorted, 0.9)),
    p95: rounded(percentile(sorted, 0.95)),
    max: rounded(sorted.at(-1) ?? 0),
    mean: rounded(safeDivide(sum(sorted), sorted.length)),
  };
}

function correlation(left: readonly number[], right: readonly number[]): number {
  if (left.length === 0 || left.length !== right.length) return 0;
  const leftMean = safeDivide(sum([...left]), left.length);
  const rightMean = safeDivide(sum([...right]), right.length);
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = finite(left[index]) - leftMean;
    const rightDelta = finite(right[index]) - rightMean;
    covariance += leftDelta * rightDelta;
    leftVariance += leftDelta ** 2;
    rightVariance += rightDelta ** 2;
  }

  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator > Number.EPSILON
    ? round(clamp(covariance / denominator, -1, 1), 3)
    : 0;
}

function isWorseSample(candidate: InternalSample, current: InternalSample): boolean {
  if (candidate.riskScore !== current.riskScore) return candidate.riskScore > current.riskScore;
  if (candidate.fundingRequirementKrw !== current.fundingRequirementKrw) {
    return candidate.fundingRequirementKrw > current.fundingRequirementKrw;
  }
  if (candidate.survivalMarginKrw !== current.survivalMarginKrw) {
    return candidate.survivalMarginKrw < current.survivalMarginKrw;
  }
  return candidate.sampleIndex < current.sampleIndex;
}

function toPublicSample(sample: InternalSample): MonteCarloSampleSummary {
  return {
    sampleIndex: sample.sampleIndex,
    scenario: sample.scenario,
    riskScore: sample.riskScore,
    riskLevel: sample.riskLevel,
    peakCashShortfallKrw: sample.peakCashShortfallKrw,
    fundingRequirementKrw: sample.fundingRequirementKrw,
    survivalMarginKrw: sample.survivalMarginKrw,
    survivalMarginPct: sample.survivalMarginPct,
    cashRunwayMonths: sample.cashRunwayMonths,
  };
}

/**
 * Runs an auditable, seed-based stress simulation over the existing contract
 * cash-flow model. Results describe outcomes under explicit assumptions; they
 * are not calibrated probabilities or guarantees of future performance.
 */
export function simulateContractRisk(
  contract: ContractRecord,
  options: MonteCarloSimulationOptions = {},
): MonteCarloSimulationResult {
  const { requested: requestedSampleCount, effective: sampleCount } =
    normalizeSampleCount(options.sampleCount);
  const seed = normalizeSeed(options.seed);
  const uncertaintyMultiplier = clamp(
    finite(options.uncertaintyMultiplier ?? 1, 1),
    0,
    3,
  );
  const distributions = sanitizeDistributions(options.distributions, uncertaintyMultiplier);
  const random = createRandom(seed);
  const normal = createStandardNormal(random);
  const baseline = analyzeContract(contract);
  const samples: InternalSample[] = [];

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const scenario = sampleScenario(normal, distributions);
    const analysis = analyzeContract(contract, scenario);
    samples.push({
      sampleIndex,
      scenario,
      driverValues: scenario,
      riskScore: analysis.riskScore,
      riskLevel: analysis.riskLevel,
      peakCashShortfallKrw: analysis.peakCashShortfallKrw,
      fundingRequirementKrw: analysis.financingRecommendation.fundingRequirementKrw,
      survivalMarginKrw: analysis.survivalMarginKrw,
      survivalMarginPct: analysis.survivalMarginPct,
      cashRunwayMonths: analysis.cashRunwayMonths,
    });
  }

  const fundingRequirements = samples.map((sample) => sample.fundingRequirementKrw);
  const cashShortfalls = samples.map((sample) => sample.peakCashShortfallKrw);
  const survivalMargins = samples.map((sample) => sample.survivalMarginKrw);
  const survivalMarginPercentages = samples.map((sample) => sample.survivalMarginPct);
  const riskScores = samples.map((sample) => sample.riskScore);
  const probability = (count: number) => round(safeDivide(count, sampleCount) * 100, 1);
  const riskLevels: RiskLevel[] = ["low", "caution", "high", "critical"];
  const riskDistribution = Object.fromEntries(
    riskLevels.map((riskLevel) => {
      const count = samples.filter((sample) => sample.riskLevel === riskLevel).length;
      return [riskLevel, { count, probabilityPct: probability(count) }];
    }),
  ) as Record<RiskLevel, MonteCarloRiskBucket>;

  let worstSample = samples[0];
  for (let index = 1; index < samples.length; index += 1) {
    if (isWorseSample(samples[index], worstSample)) worstSample = samples[index];
  }

  const driverSensitivity = DRIVER_KEYS.map((driver) => {
    const driverValues = samples.map((sample) => sample.driverValues[driver]);
    return {
      driver,
      label: DRIVER_LABELS[driver],
      correlationToSurvivalMargin: correlation(driverValues, survivalMargins),
      correlationToFundingRequirement: correlation(driverValues, fundingRequirements),
    };
  }).sort(
    (left, right) =>
      Math.abs(right.correlationToSurvivalMargin) -
      Math.abs(left.correlationToSurvivalMargin),
  );

  return {
    contractId: baseline.contractId,
    baseline,
    probabilities: {
      cashShortfallPct: probability(
        samples.filter((sample) => sample.peakCashShortfallKrw > 0).length,
      ),
      negativeSurvivalMarginPct: probability(
        samples.filter((sample) => sample.survivalMarginKrw < 0).length,
      ),
      highOrCriticalRiskPct: probability(
        samples.filter(
          (sample) => sample.riskLevel === "high" || sample.riskLevel === "critical",
        ).length,
      ),
    },
    fundingRequirementKrw: summarize(fundingRequirements),
    peakCashShortfallKrw: summarize(cashShortfalls),
    survivalMarginKrw: summarize(survivalMargins),
    survivalMarginPct: summarize(survivalMarginPercentages, 1),
    riskScore: summarize(riskScores, 1),
    riskDistribution,
    sampledScenarios: Object.fromEntries(
      DRIVER_KEYS.map((driver) => [
        driver,
        summarize(samples.map((sample) => sample.scenario[driver]), 2),
      ]),
    ) as Record<MonteCarloDriver, MonteCarloPercentiles>,
    worstSample: toPublicSample(worstSample),
    driverSensitivity,
    metadata: {
      engineVersion: MONTE_CARLO_ENGINE_VERSION,
      sampleCount,
      requestedSampleCount,
      seed,
      uncertaintyMultiplier,
      deterministic: true,
      distributions,
      correlationModel:
        "단일 공통 충격 요인과 요인별 독립 정규충격을 결합한 제한 정규분포",
      worstSampleSelectionRule:
        "위험점수 최대, 동률이면 필요자금 최대, 다시 동률이면 생존마진 최소",
      caveats: [
        "표시 확률은 명시된 분포 가정 아래의 시뮬레이션 비율이며 통계적으로 보정된 예측확률이 아닙니다.",
        "결과는 의사결정 보조자료이며 실제 원가, 지급일정, 금리와 계약조건을 확인해야 합니다.",
        "상관구조는 꼬리위험 탐색을 위한 설명 가능한 가정이며 인과관계나 미래 성과를 보장하지 않습니다.",
      ],
    },
  };
}
