import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

import type { ContractRecord, ScenarioInputs } from "../src/lib/domain.ts";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const { analyzeContract } = await import("../src/lib/analytics/analysis.ts");
const {
  DEFAULT_MONTE_CARLO_SAMPLE_COUNT,
  simulateContractRisk,
} = await import("../src/lib/analytics/monte-carlo.ts");

const contract: ContractRecord = {
  id: "monte-carlo-contract",
  procurementId: "MC-001",
  title: "확률형 위험 분석 검증 계약",
  companyName: "테스트 기업",
  companySize: "small",
  industry: "정보서비스",
  region: "서울",
  buyer: "테스트 발주처",
  awardedAt: "2026-07-01",
  contractAmountKrw: 300_000_000,
  baseAmountKrw: 340_000_000,
  bidRatePct: 88.2,
  estimatedTotalCostKrw: 270_000_000,
  availableCashKrw: 25_000_000,
  monthlyOperatingCashOutflowKrw: 12_000_000,
  existingBorrowingsKrw: 120_000_000,
  monthlyDebtServiceKrw: 4_000_000,
  annualInterestRatePct: 6.5,
  durationMonths: 8,
  paymentDelayDays: 45,
  advancePaymentRatePct: 10,
  retentionRatePct: 3,
  guaranteeDepositRatePct: 5,
  upfrontCostRatePct: 35,
  fixedCostRatePct: 30,
  paymentSchedule: "milestone",
  dataQuality: "synthetic",
  isSynthetic: true,
};

const drivers: Array<keyof ScenarioInputs> = [
  "costInflationPct",
  "paymentDelayDays",
  "interestRateChangePctPoints",
  "orderVolumeChangePct",
];

test("a seed reproduces the complete simulation result", () => {
  const first = simulateContractRisk(contract, { sampleCount: 120, seed: "audit-run" });
  const second = simulateContractRisk(contract, { sampleCount: 120, seed: "audit-run" });

  assert.deepEqual(first, second);
  assert.equal(first.metadata.deterministic, true);
  assert.equal(first.metadata.sampleCount, 120);
  assert.ok(first.metadata.caveats.some((caveat) => caveat.includes("예측확률이 아닙니다")));
});

test("different seeds produce different scenario paths", () => {
  const first = simulateContractRisk(contract, { sampleCount: 100, seed: 11 });
  const second = simulateContractRisk(contract, { sampleCount: 100, seed: 12 });

  assert.notDeepEqual(first.sampledScenarios, second.sampledScenarios);
  assert.notEqual(first.metadata.seed, second.metadata.seed);
});

test("percentiles, probability buckets and worst sample reconcile", () => {
  const result = simulateContractRisk(contract, { sampleCount: 250, seed: 20260714 });
  const percentileGroups = [
    result.fundingRequirementKrw,
    result.peakCashShortfallKrw,
    result.survivalMarginKrw,
    result.survivalMarginPct,
    result.riskScore,
    ...Object.values(result.sampledScenarios),
  ];

  for (const values of percentileGroups) {
    assert.ok(values.min <= values.p10);
    assert.ok(values.p10 <= values.p25);
    assert.ok(values.p25 <= values.p50);
    assert.ok(values.p50 <= values.p75);
    assert.ok(values.p75 <= values.p90);
    assert.ok(values.p90 <= values.p95);
    assert.ok(values.p95 <= values.max);
    assert.ok(values.mean >= values.min && values.mean <= values.max);
  }

  const bucketCount = Object.values(result.riskDistribution).reduce(
    (total, bucket) => total + bucket.count,
    0,
  );
  assert.equal(bucketCount, 250);
  assert.equal(result.worstSample.riskScore, result.riskScore.max);
  assert.ok(Object.values(result.probabilities).every((value) => value >= 0 && value <= 100));
  assert.equal(result.driverSensitivity.length, 4);
  assert.deepEqual(
    new Set(result.driverSensitivity.map((item) => item.driver)),
    new Set(drivers),
  );
  assert.ok(
    result.driverSensitivity.every(
      (item) =>
        Math.abs(item.correlationToSurvivalMargin) <= 1 &&
        Math.abs(item.correlationToFundingRequirement) <= 1,
    ),
  );
});

test("zero uncertainty collapses every percentile to the requested scenario", () => {
  const scenario: ScenarioInputs = {
    costInflationPct: 12,
    paymentDelayDays: 60,
    interestRateChangePctPoints: 2.5,
    orderVolumeChangePct: -8,
  };
  const distributions = Object.fromEntries(
    drivers.map((driver) => [driver, { mean: scenario[driver], standardDeviation: 0 }]),
  );
  const expected = analyzeContract(contract, scenario);
  const result = simulateContractRisk(contract, {
    sampleCount: 100,
    seed: 77,
    uncertaintyMultiplier: 0,
    distributions,
  });

  assert.equal(result.fundingRequirementKrw.min, expected.financingRecommendation.fundingRequirementKrw);
  assert.equal(result.fundingRequirementKrw.p50, result.fundingRequirementKrw.min);
  assert.equal(result.fundingRequirementKrw.p90, result.fundingRequirementKrw.min);
  assert.equal(result.survivalMarginKrw.min, expected.survivalMarginKrw);
  assert.equal(result.survivalMarginKrw.max, expected.survivalMarginKrw);
  assert.deepEqual(result.worstSample.scenario, scenario);
  assert.ok(
    result.driverSensitivity.every(
      (item) =>
        item.correlationToSurvivalMargin === 0 &&
        item.correlationToFundingRequirement === 0,
    ),
  );
});

test("sample count and malformed distribution inputs are safely bounded", () => {
  const minimum = simulateContractRisk(contract, {
    sampleCount: -10,
    seed: Number.NaN,
    uncertaintyMultiplier: Number.POSITIVE_INFINITY,
    distributions: {
      costInflationPct: {
        mean: Number.NaN,
        standardDeviation: Number.NEGATIVE_INFINITY,
        minimum: 500,
        maximum: -500,
        systemicLoading: 50,
      },
    },
  });
  const maximum = simulateContractRisk(contract, { sampleCount: 50_000, seed: 1 });

  assert.equal(minimum.metadata.sampleCount, 100);
  assert.equal(maximum.metadata.sampleCount, 1_000);
  assert.equal(minimum.metadata.requestedSampleCount, -10);
  assert.equal(maximum.metadata.requestedSampleCount, 50_000);
  assert.equal(minimum.metadata.distributions.costInflationPct.minimum, -50);
  assert.equal(minimum.metadata.distributions.costInflationPct.maximum, 200);
  assert.equal(minimum.metadata.distributions.costInflationPct.systemicLoading, 0.95);
  assert.ok(Number.isFinite(maximum.fundingRequirementKrw.p90));
});

test("the default run is finite and exposes decision-useful tail measures", () => {
  const result = simulateContractRisk(contract);
  const numericOutput = [
    ...Object.values(result.probabilities),
    ...Object.values(result.fundingRequirementKrw),
    ...Object.values(result.peakCashShortfallKrw),
    ...Object.values(result.survivalMarginKrw),
    ...Object.values(result.riskScore),
  ];

  assert.equal(result.metadata.sampleCount, DEFAULT_MONTE_CARLO_SAMPLE_COUNT);
  assert.ok(numericOutput.every(Number.isFinite));
  assert.ok(result.fundingRequirementKrw.p90 >= result.fundingRequirementKrw.p50);
  assert.ok(result.survivalMarginKrw.p10 <= result.survivalMarginKrw.p50);
  assert.ok(result.peakCashShortfallKrw.p90 >= result.peakCashShortfallKrw.p50);
});
