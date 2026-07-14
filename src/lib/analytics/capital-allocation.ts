import type { ContractAnalysis, RiskLevel } from "../domain";
import { clamp, finite, nonNegative, round, safeDivide, sum } from "./math";

export type CapitalAllocationStatus =
  | "not-required"
  | "fully-funded"
  | "partially-funded"
  | "unfunded";

export type CapitalUnallocatedReasonCode =
  | "not-required"
  | "budget-exhausted"
  | "lower-priority"
  | "manual-review-hold";

export type CapitalEligibilityPolicy =
  | "viable-only"
  | "include-manual-review";

export interface CapitalAllocationOptions {
  /**
   * `viable-only` retains capital when a contract has a negative survival
   * margin. `include-manual-review` explicitly permits those allocations.
   */
  eligibilityPolicy?: CapitalEligibilityPolicy;
}

export interface CapitalAllocationScoreBreakdown {
  riskUrgencyScore: number;
  liquidityIntensityScore: number;
  runwayUrgencyScore: number;
  marginViabilityScore: number;
}

export interface CapitalAllocationItem {
  /** One-based rank among contracts eligible for automatic allocation. */
  rank: number | null;
  contractId: string;
  procurementId: string;
  companyName: string;
  contractTitle: string;
  riskLevel: RiskLevel;
  riskScore: number;
  survivalMarginKrw: number;
  survivalMarginPct: number;
  cashRunwayMonths: number;
  fundingRequirementKrw: number;
  allocatedKrw: number;
  remainingGapKrw: number;
  coveragePct: number;
  status: CapitalAllocationStatus;
  priorityScore: number;
  scoreBreakdown: CapitalAllocationScoreBreakdown;
  priorityReasons: string[];
  requiresManualReview: boolean;
  allocationEligible: boolean;
  unallocatedReasonCode?: CapitalUnallocatedReasonCode;
  unallocatedReason?: string;
}

export interface CapitalAllocationStatusCounts {
  notRequired: number;
  fullyFunded: number;
  partiallyFunded: number;
  unfunded: number;
  manualReviewHeld: number;
}

export interface CapitalAllocationSummary {
  availableBudgetKrw: number;
  totalFundingRequirementKrw: number;
  deployedCapitalKrw: number;
  unallocatedCapitalKrw: number;
  remainingFundingGapKrw: number;
  /** Unweighted share of the total modelled funding requirement that is covered. */
  coveragePct: number;
  /**
   * Coverage weighted by each contract's explainable priority score. This is a
   * decision-support index, not an accounting amount or a predicted loss rate.
   */
  priorityWeightedMitigationPct: number;
  highAndCriticalRequirementKrw: number;
  highAndCriticalAllocatedKrw: number;
  atRiskCoveragePct: number;
  statusCounts: CapitalAllocationStatusCounts;
}

export interface CapitalAllocationPolicy {
  strategy: "priority-waterfall";
  eligibilityPolicy: CapitalEligibilityPolicy;
  eligibilityDescription: string;
  scoreWeights: {
    riskUrgency: number;
    liquidityIntensity: number;
    runwayUrgency: number;
    marginViability: number;
  };
  liquidityIntensityFullScoreAtPctOfRevenue: number;
  viableMarginRangePct: { minimum: number; fullScore: number };
  tieBreakers: readonly string[];
  description: string;
}

export interface CapitalAllocationPlan {
  allocations: CapitalAllocationItem[];
  summary: CapitalAllocationSummary;
  policy: CapitalAllocationPolicy;
  warnings: string[];
}

export const CAPITAL_ALLOCATION_POLICY: Readonly<CapitalAllocationPolicy> = Object.freeze({
  strategy: "priority-waterfall",
  eligibilityPolicy: "viable-only",
  eligibilityDescription:
    "생존마진이 음수인 계약은 자동 배분하지 않고 수익성·이행 의무 수동 검토 전까지 예산을 보존",
  scoreWeights: Object.freeze({
    riskUrgency: 0.35,
    liquidityIntensity: 0.25,
    runwayUrgency: 0.25,
    marginViability: 0.15,
  }),
  liquidityIntensityFullScoreAtPctOfRevenue: 35,
  viableMarginRangePct: Object.freeze({ minimum: -5, fullScore: 15 }),
  tieBreakers: Object.freeze([
    "위험점수 높은 순",
    "현금 런웨이 짧은 순",
    "필요자금 큰 순",
    "계약 ID·조달번호·계약명 사전순",
  ]),
  description:
    "위험 긴급도, 매출 대비 유동성 공백, 현금 런웨이, 생존마진의 경제성을 합산한 우선순위 폭포식 배분",
});

interface RankedCandidate {
  analysis: ContractAnalysis;
  fundingRequirementKrw: number;
  priorityScore: number;
  scoreBreakdown: CapitalAllocationScoreBreakdown;
  priorityReasons: string[];
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function sanitizeWon(value: number): number {
  return round(nonNegative(value));
}

function buildCandidate(analysis: ContractAnalysis): RankedCandidate {
  const fundingRequirementKrw = sanitizeWon(
    analysis.financingRecommendation.fundingRequirementKrw,
  );
  const riskUrgencyScore = round(clamp(finite(analysis.riskScore), 0, 100), 1);
  const adjustedRevenueKrw = nonNegative(analysis.adjustedRevenueKrw);
  const liquidityIntensityPct = adjustedRevenueKrw > 0
    ? safeDivide(fundingRequirementKrw, adjustedRevenueKrw) * 100
    : fundingRequirementKrw > 0
      ? 100
      : 0;
  const liquidityIntensityScore = round(
    clamp(
      safeDivide(
        liquidityIntensityPct,
        CAPITAL_ALLOCATION_POLICY.liquidityIntensityFullScoreAtPctOfRevenue,
      ) * 100,
      0,
      100,
    ),
    1,
  );
  const cashRunwayMonths = clamp(finite(analysis.cashRunwayMonths, 12), 0, 12);
  const runwayUrgencyScore = round((1 - cashRunwayMonths / 12) * 100, 1);
  const marginMinimum = CAPITAL_ALLOCATION_POLICY.viableMarginRangePct.minimum;
  const marginFullScore = CAPITAL_ALLOCATION_POLICY.viableMarginRangePct.fullScore;
  const marginViabilityScore = round(
    clamp(
      safeDivide(
        finite(analysis.survivalMarginPct) - marginMinimum,
        marginFullScore - marginMinimum,
      ) * 100,
      0,
      100,
    ),
    1,
  );
  const weights = CAPITAL_ALLOCATION_POLICY.scoreWeights;
  const priorityScore = round(
    riskUrgencyScore * weights.riskUrgency +
      liquidityIntensityScore * weights.liquidityIntensity +
      runwayUrgencyScore * weights.runwayUrgency +
      marginViabilityScore * weights.marginViability,
    1,
  );

  return {
    analysis,
    fundingRequirementKrw,
    priorityScore,
    scoreBreakdown: {
      riskUrgencyScore,
      liquidityIntensityScore,
      runwayUrgencyScore,
      marginViabilityScore,
    },
    priorityReasons: [
      `위험 긴급도 ${riskUrgencyScore.toFixed(1)}점(가중치 35%)`,
      `매출 대비 필요자금 ${round(liquidityIntensityPct, 1).toFixed(1)}%(유동성 강도 가중치 25%)`,
      `현금 런웨이 ${round(cashRunwayMonths, 1).toFixed(1)}개월(긴급도 가중치 25%)`,
      `생존마진 ${round(finite(analysis.survivalMarginPct), 1).toFixed(1)}%(경제성 가중치 15%)`,
    ],
  };
}

function compareCandidates(left: RankedCandidate, right: RankedCandidate): number {
  const leftRequiresFunding = left.fundingRequirementKrw > 0;
  const rightRequiresFunding = right.fundingRequirementKrw > 0;
  if (leftRequiresFunding !== rightRequiresFunding) return leftRequiresFunding ? -1 : 1;
  const byPriority = right.priorityScore - left.priorityScore;
  if (byPriority !== 0) return byPriority;
  const byRisk = finite(right.analysis.riskScore) - finite(left.analysis.riskScore);
  if (byRisk !== 0) return byRisk;
  const byRunway = finite(left.analysis.cashRunwayMonths, 12) -
    finite(right.analysis.cashRunwayMonths, 12);
  if (byRunway !== 0) return byRunway;
  const byRequirement = right.fundingRequirementKrw - left.fundingRequirementKrw;
  if (byRequirement !== 0) return byRequirement;
  return (
    compareText(left.analysis.contractId, right.analysis.contractId) ||
    compareText(left.analysis.procurementId, right.analysis.procurementId) ||
    compareText(left.analysis.contractTitle, right.analysis.contractTitle) ||
    compareText(left.analysis.companyName, right.analysis.companyName)
  );
}

function buildUnallocatedReason(
  status: CapitalAllocationStatus,
  availableBudgetKrw: number,
  manualReviewHold: boolean,
): Pick<CapitalAllocationItem, "unallocatedReasonCode" | "unallocatedReason"> {
  if (status === "not-required") {
    return {
      unallocatedReasonCode: "not-required",
      unallocatedReason: "분석 모델상 추가 운전자금이 필요하지 않습니다.",
    };
  }
  if (manualReviewHold) {
    return {
      unallocatedReasonCode: "manual-review-hold",
      unallocatedReason:
        "생존마진이 음수여서 자동 배분을 보류했습니다. 수익성·계약 이행 의무를 검토한 뒤 명시적으로 승인해야 합니다.",
    };
  }
  if (status === "fully-funded") return {};
  if (status === "partially-funded" || availableBudgetKrw === 0) {
    return {
      unallocatedReasonCode: "budget-exhausted",
      unallocatedReason: "해당 계약 배분 도중 가용 예산이 소진되어 잔여 공백이 남았습니다.",
    };
  }
  return {
    unallocatedReasonCode: "lower-priority",
    unallocatedReason: "상위 우선순위 계약에 예산을 먼저 배분한 뒤 가용 예산이 소진되었습니다.",
  };
}

/**
 * Allocates a finite working-capital budget across analysed contracts.
 *
 * The engine is deliberately deterministic and audit-friendly: candidates are
 * sorted by a documented score, then funded in that order. The last funded
 * contract may receive a partial allocation; all arithmetic is rounded to KRW.
 */
export function allocateWorkingCapital(
  analyses: readonly ContractAnalysis[],
  rawAvailableBudgetKrw: number,
  options: CapitalAllocationOptions = {},
): CapitalAllocationPlan {
  const availableBudgetKrw = sanitizeWon(rawAvailableBudgetKrw);
  const eligibilityPolicy: CapitalEligibilityPolicy =
    options.eligibilityPolicy === "include-manual-review"
      ? "include-manual-review"
      : "viable-only";
  const isManualReviewHold = (candidate: RankedCandidate) =>
    eligibilityPolicy === "viable-only" &&
    candidate.fundingRequirementKrw > 0 &&
    finite(candidate.analysis.survivalMarginKrw) < 0;
  const ranked = analyses
    .map(buildCandidate)
    .sort((left, right) => {
      const allocationClass = (candidate: RankedCandidate) =>
        candidate.fundingRequirementKrw === 0
          ? 2
          : isManualReviewHold(candidate)
            ? 1
            : 0;
      const classDifference = allocationClass(left) - allocationClass(right);
      if (classDifference !== 0) return classDifference;
      return compareCandidates(left, right);
    });
  let remainingBudgetKrw = availableBudgetKrw;
  let fundedRank = 0;

  const allocations = ranked.map((candidate): CapitalAllocationItem => {
    const analysis = candidate.analysis;
    const requirement = candidate.fundingRequirementKrw;
    const manualReviewHold = isManualReviewHold(candidate);
    const allocationEligible = requirement > 0 && !manualReviewHold;
    const rank = allocationEligible ? ++fundedRank : null;
    const allocatedKrw = allocationEligible
      ? Math.min(requirement, remainingBudgetKrw)
      : 0;
    remainingBudgetKrw = sanitizeWon(remainingBudgetKrw - allocatedKrw);
    const remainingGapKrw = sanitizeWon(requirement - allocatedKrw);
    const status: CapitalAllocationStatus = requirement === 0
      ? "not-required"
      : remainingGapKrw === 0
        ? "fully-funded"
        : allocatedKrw > 0
          ? "partially-funded"
          : "unfunded";
    const coveragePct = requirement > 0
      ? round(safeDivide(allocatedKrw, requirement) * 100, 1)
      : 100;

    return {
      rank,
      contractId: analysis.contractId,
      procurementId: analysis.procurementId,
      companyName: analysis.companyName,
      contractTitle: analysis.contractTitle,
      riskLevel: analysis.riskLevel,
      riskScore: round(clamp(finite(analysis.riskScore), 0, 100), 1),
      survivalMarginKrw: round(finite(analysis.survivalMarginKrw)),
      survivalMarginPct: round(finite(analysis.survivalMarginPct), 1),
      cashRunwayMonths: round(clamp(finite(analysis.cashRunwayMonths, 12), 0, 12), 1),
      fundingRequirementKrw: requirement,
      allocatedKrw,
      remainingGapKrw,
      coveragePct,
      status,
      priorityScore: requirement > 0 ? candidate.priorityScore : 0,
      scoreBreakdown: candidate.scoreBreakdown,
      priorityReasons: candidate.priorityReasons,
      requiresManualReview:
        finite(analysis.survivalMarginKrw) < 0 || analysis.riskLevel === "critical",
      allocationEligible,
      ...buildUnallocatedReason(status, availableBudgetKrw, manualReviewHold),
    };
  });

  const totalFundingRequirementKrw = sanitizeWon(
    sum(allocations.map((item) => item.fundingRequirementKrw)),
  );
  const deployedCapitalKrw = sanitizeWon(
    sum(allocations.map((item) => item.allocatedKrw)),
  );
  const remainingFundingGapKrw = sanitizeWon(
    sum(allocations.map((item) => item.remainingGapKrw)),
  );
  const unallocatedCapitalKrw = sanitizeWon(availableBudgetKrw - deployedCapitalKrw);
  const weightedRequirement = sum(
    allocations.map(
      (item) => item.fundingRequirementKrw * (1 + item.priorityScore / 100),
    ),
  );
  const weightedAllocation = sum(
    allocations.map((item) => item.allocatedKrw * (1 + item.priorityScore / 100)),
  );
  const atRisk = allocations.filter(
    (item) => item.riskLevel === "high" || item.riskLevel === "critical",
  );
  const highAndCriticalRequirementKrw = sanitizeWon(
    sum(atRisk.map((item) => item.fundingRequirementKrw)),
  );
  const highAndCriticalAllocatedKrw = sanitizeWon(
    sum(atRisk.map((item) => item.allocatedKrw)),
  );
  const statusCounts: CapitalAllocationStatusCounts = {
    notRequired: allocations.filter((item) => item.status === "not-required").length,
    fullyFunded: allocations.filter((item) => item.status === "fully-funded").length,
    partiallyFunded: allocations.filter((item) => item.status === "partially-funded").length,
    unfunded: allocations.filter((item) => item.status === "unfunded").length,
    manualReviewHeld: allocations.filter(
      (item) => item.unallocatedReasonCode === "manual-review-hold",
    ).length,
  };
  const heldForManualReview = allocations.filter(
    (item) => item.unallocatedReasonCode === "manual-review-hold",
  );
  const heldFundingGapKrw = sanitizeWon(
    sum(heldForManualReview.map((item) => item.remainingGapKrw)),
  );
  const eligibleFundingGapKrw = sanitizeWon(remainingFundingGapKrw - heldFundingGapKrw);
  const warnings: string[] = [];
  if (eligibleFundingGapKrw > 0) {
    warnings.push("제한된 예산으로 모든 유동성 공백을 해소하지 못했습니다. 미배분 계약의 조달 조건을 재협상해야 합니다.");
  }
  if (heldForManualReview.length > 0) {
    warnings.push(
      `생존마진이 음수인 ${heldForManualReview.length}개 계약은 자동 배분을 보류했습니다. 명시적 승인 전까지 해당 예산은 보존됩니다.`,
    );
  }
  if (allocations.some((item) => item.requiresManualReview && item.allocatedKrw > 0)) {
    warnings.push("손실 예상 또는 임계 위험 계약에 배분이 포함되었습니다. 집행 전 수익성·법적 이행 의무를 수동 검토하세요.");
  }
  if (analyses.length === 0) {
    warnings.push("분석할 계약이 없어 자금 배분을 수행하지 않았습니다.");
  }

  return {
    allocations,
    summary: {
      availableBudgetKrw,
      totalFundingRequirementKrw,
      deployedCapitalKrw,
      unallocatedCapitalKrw,
      remainingFundingGapKrw,
      coveragePct: totalFundingRequirementKrw > 0
        ? round(safeDivide(deployedCapitalKrw, totalFundingRequirementKrw) * 100, 1)
        : 100,
      priorityWeightedMitigationPct: weightedRequirement > 0
        ? round(safeDivide(weightedAllocation, weightedRequirement) * 100, 1)
        : 100,
      highAndCriticalRequirementKrw,
      highAndCriticalAllocatedKrw,
      atRiskCoveragePct: highAndCriticalRequirementKrw > 0
        ? round(
            safeDivide(highAndCriticalAllocatedKrw, highAndCriticalRequirementKrw) * 100,
            1,
          )
        : 100,
      statusCounts,
    },
    policy: eligibilityPolicy === "viable-only"
      ? CAPITAL_ALLOCATION_POLICY
      : {
          ...CAPITAL_ALLOCATION_POLICY,
          eligibilityPolicy,
          eligibilityDescription:
            "수동 검토 대상인 음수 생존마진 계약도 명시적 승인에 따라 우선순위 배분에 포함",
        },
    warnings,
  };
}
