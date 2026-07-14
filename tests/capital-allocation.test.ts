import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

import { demoContracts } from "../src/data/demo.ts";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const { analyzeContract } = await import("../src/lib/analytics/analysis.ts");
const { allocateWorkingCapital } = await import(
  "../src/lib/analytics/capital-allocation.ts"
);

const fundingAnalyses = demoContracts
  .map((contract) => analyzeContract(contract))
  .filter((analysis) => analysis.financingRecommendation.fundingRequirementKrw > 0);

function buildLossMakingAnalysis() {
  const base = fundingAnalyses[0];
  assert.ok(base);
  return {
    ...base,
    contractId: "loss-making-allocation-test",
    procurementId: "LOSS-MAKING-001",
    contractTitle: "Loss-making contract",
    survivalMarginKrw: -10_000_000,
    survivalMarginPct: -10,
  };
}

test("limited capital is conserved and the final funded contract can be partial", () => {
  assert.ok(fundingAnalyses.length >= 3);
  const fullPlan = allocateWorkingCapital(fundingAnalyses, Number.MAX_SAFE_INTEGER);
  const first = fullPlan.allocations[0];
  const second = fullPlan.allocations[1];
  const budget = first.fundingRequirementKrw + Math.max(1, Math.floor(second.fundingRequirementKrw / 2));
  const plan = allocateWorkingCapital(fundingAnalyses, budget);
  const allocatedTotal = plan.allocations.reduce((total, item) => total + item.allocatedKrw, 0);
  const gapTotal = plan.allocations.reduce((total, item) => total + item.remainingGapKrw, 0);

  assert.equal(plan.summary.availableBudgetKrw, budget);
  assert.equal(plan.summary.deployedCapitalKrw, budget);
  assert.equal(plan.summary.unallocatedCapitalKrw, 0);
  assert.equal(allocatedTotal, budget);
  assert.equal(gapTotal, plan.summary.remainingFundingGapKrw);
  assert.equal(plan.allocations[0].status, "fully-funded");
  assert.equal(plan.allocations[1].status, "partially-funded");
  assert.equal(plan.allocations[1].unallocatedReasonCode, "budget-exhausted");
  assert.ok(plan.allocations.slice(2).every((item) => item.status === "unfunded"));
  assert.ok(plan.summary.coveragePct > 0 && plan.summary.coveragePct < 100);
  assert.ok(plan.summary.priorityWeightedMitigationPct >= plan.summary.coveragePct);
});

test("allocation is deterministic and independent of source ordering", () => {
  const totalNeed = fundingAnalyses.reduce(
    (total, analysis) =>
      total + analysis.financingRecommendation.fundingRequirementKrw,
    0,
  );
  const budget = Math.floor(totalNeed * 0.47);
  const forward = allocateWorkingCapital(fundingAnalyses, budget);
  const reverse = allocateWorkingCapital([...fundingAnalyses].reverse(), budget);

  assert.deepEqual(forward, reverse);
  assert.ok(
    forward.allocations.every(
      (item, index, values) =>
        index === 0 ||
        values[index - 1].priorityScore >= item.priorityScore,
    ),
  );
});

test("zero and invalid budgets deploy no capital and explain every funding gap", () => {
  for (const budget of [0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
    const plan = allocateWorkingCapital(fundingAnalyses, budget);

    assert.equal(plan.summary.availableBudgetKrw, 0);
    assert.equal(plan.summary.deployedCapitalKrw, 0);
    assert.equal(plan.summary.unallocatedCapitalKrw, 0);
    assert.equal(plan.summary.coveragePct, 0);
    assert.ok(plan.allocations.every((item) => item.allocatedKrw === 0));
    assert.ok(
      plan.allocations.every(
        (item) =>
          item.unallocatedReasonCode === "budget-exhausted" ||
          item.unallocatedReasonCode === "manual-review-hold",
      ),
    );
  }
});

test("an oversized budget fully covers needs and preserves the unused balance", () => {
  const totalNeed = fundingAnalyses.reduce(
    (total, analysis) =>
      total + analysis.financingRecommendation.fundingRequirementKrw,
    0,
  );
  const extra = 12_345_678;
  const plan = allocateWorkingCapital(fundingAnalyses, totalNeed + extra, {
    eligibilityPolicy: "include-manual-review",
  });

  assert.equal(plan.summary.totalFundingRequirementKrw, totalNeed);
  assert.equal(plan.summary.deployedCapitalKrw, totalNeed);
  assert.equal(plan.summary.unallocatedCapitalKrw, extra);
  assert.equal(plan.summary.remainingFundingGapKrw, 0);
  assert.equal(plan.summary.coveragePct, 100);
  assert.equal(plan.summary.priorityWeightedMitigationPct, 100);
  assert.ok(plan.allocations.every((item) => item.status === "fully-funded"));
});

test("negative-survival-margin contracts are held by default and preserve capital", () => {
  const lossMaking = buildLossMakingAnalysis();
  const requirement = lossMaking.financingRecommendation.fundingRequirementKrw;
  const budget = requirement + 7_000_000;
  const plan = allocateWorkingCapital([lossMaking], budget);
  const allocation = plan.allocations[0];

  assert.equal(plan.policy.eligibilityPolicy, "viable-only");
  assert.equal(allocation.requiresManualReview, true);
  assert.equal(allocation.allocationEligible, false);
  assert.equal(allocation.rank, null);
  assert.equal(allocation.status, "unfunded");
  assert.equal(allocation.allocatedKrw, 0);
  assert.equal(allocation.remainingGapKrw, requirement);
  assert.equal(allocation.unallocatedReasonCode, "manual-review-hold");
  assert.match(allocation.unallocatedReason ?? "", /생존마진/);
  assert.equal(plan.summary.deployedCapitalKrw, 0);
  assert.equal(plan.summary.unallocatedCapitalKrw, budget);
  assert.equal(plan.summary.remainingFundingGapKrw, requirement);
  assert.equal(plan.summary.statusCounts.manualReviewHeld, 1);
  assert.equal(
    plan.summary.deployedCapitalKrw + plan.summary.unallocatedCapitalKrw,
    plan.summary.availableBudgetKrw,
  );
  assert.ok(plan.warnings.some((warning) => warning.includes("자동 배분을 보류")));
});

test("explicit manual-review override permits allocation to a loss-making contract", () => {
  const lossMaking = buildLossMakingAnalysis();
  const requirement = lossMaking.financingRecommendation.fundingRequirementKrw;
  const extra = 5_000_000;
  const plan = allocateWorkingCapital([lossMaking], requirement + extra, {
    eligibilityPolicy: "include-manual-review",
  });
  const allocation = plan.allocations[0];

  assert.equal(plan.policy.eligibilityPolicy, "include-manual-review");
  assert.equal(allocation.requiresManualReview, true);
  assert.equal(allocation.allocationEligible, true);
  assert.equal(allocation.rank, 1);
  assert.equal(allocation.status, "fully-funded");
  assert.equal(allocation.allocatedKrw, requirement);
  assert.equal(allocation.unallocatedReasonCode, undefined);
  assert.equal(plan.summary.deployedCapitalKrw, requirement);
  assert.equal(plan.summary.unallocatedCapitalKrw, extra);
  assert.equal(plan.summary.statusCounts.manualReviewHeld, 0);
  assert.ok(plan.warnings.some((warning) => warning.includes("배분이 포함")));
});

test("critical contracts with a positive survival margin remain automatically eligible", () => {
  const viable = fundingAnalyses.find((analysis) => analysis.survivalMarginKrw > 0);
  assert.ok(viable);
  const criticalButViable = {
    ...viable,
    riskLevel: "critical" as const,
    riskScore: 90,
  };
  const requirement = criticalButViable.financingRecommendation.fundingRequirementKrw;
  const plan = allocateWorkingCapital([criticalButViable], requirement);
  const allocation = plan.allocations[0];

  assert.equal(allocation.requiresManualReview, true);
  assert.equal(allocation.allocationEligible, true);
  assert.equal(allocation.status, "fully-funded");
  assert.equal(allocation.allocatedKrw, requirement);
  assert.notEqual(allocation.unallocatedReasonCode, "manual-review-hold");
});

test("held contracts are skipped while viable contracts receive capital and the remainder reconciles", () => {
  const lossMaking = buildLossMakingAnalysis();
  const viable = fundingAnalyses.find((analysis) => analysis.survivalMarginKrw > 0);
  assert.ok(viable);
  const viableNeed = viable.financingRecommendation.fundingRequirementKrw;
  const retainedForReview = Math.min(
    lossMaking.financingRecommendation.fundingRequirementKrw,
    3_000_000,
  );
  const budget = viableNeed + retainedForReview;
  const plan = allocateWorkingCapital([lossMaking, viable], budget);
  const viableAllocation = plan.allocations.find(
    (item) => item.contractId === viable.contractId,
  );
  const heldAllocation = plan.allocations.find(
    (item) => item.contractId === lossMaking.contractId,
  );

  assert.equal(viableAllocation?.allocatedKrw, viableNeed);
  assert.equal(heldAllocation?.allocatedKrw, 0);
  assert.equal(heldAllocation?.unallocatedReasonCode, "manual-review-hold");
  assert.equal(plan.summary.deployedCapitalKrw, viableNeed);
  assert.equal(plan.summary.unallocatedCapitalKrw, retainedForReview);
  assert.equal(
    plan.summary.deployedCapitalKrw + plan.summary.unallocatedCapitalKrw,
    plan.summary.availableBudgetKrw,
  );
});

test("contracts without a funding requirement do not consume budget", () => {
  const cashRich = analyzeContract({
    ...demoContracts[0],
    id: "cash-rich-allocation-test",
    procurementId: "CASH-RICH-001",
    availableCashKrw: 100_000_000_000,
    monthlyOperatingCashOutflowKrw: 0,
    monthlyDebtServiceKrw: 0,
    existingBorrowingsKrw: 0,
    guaranteeDepositRatePct: 0,
  });
  assert.equal(cashRich.financingRecommendation.fundingRequirementKrw, 0);
  const plan = allocateWorkingCapital([cashRich], 10_000_000);
  const allocation = plan.allocations[0];

  assert.equal(allocation.rank, null);
  assert.equal(allocation.status, "not-required");
  assert.equal(allocation.allocatedKrw, 0);
  assert.equal(allocation.coveragePct, 100);
  assert.equal(allocation.unallocatedReasonCode, "not-required");
  assert.equal(plan.summary.unallocatedCapitalKrw, 10_000_000);
  assert.equal(plan.summary.coveragePct, 100);
});

test("exact priority ties use stable business identifiers instead of input order", () => {
  const base = fundingAnalyses[0];
  assert.ok(base);
  const alpha = {
    ...base,
    contractId: "contract-alpha",
    procurementId: "PROC-A",
    contractTitle: "Alpha",
  };
  const beta = {
    ...base,
    contractId: "contract-beta",
    procurementId: "PROC-B",
    contractTitle: "Beta",
  };
  const requirement = base.financingRecommendation.fundingRequirementKrw;
  const budget = requirement + Math.floor(requirement / 2);
  const first = allocateWorkingCapital([beta, alpha], budget);
  const second = allocateWorkingCapital([alpha, beta], budget);

  assert.deepEqual(first, second);
  assert.equal(first.allocations[0].contractId, "contract-alpha");
  assert.equal(first.allocations[0].status, "fully-funded");
  assert.equal(first.allocations[1].contractId, "contract-beta");
  assert.equal(first.allocations[1].status, "partially-funded");
});

test("empty portfolios retain the budget and return an actionable warning", () => {
  const plan = allocateWorkingCapital([], 5_000_000);

  assert.equal(plan.allocations.length, 0);
  assert.equal(plan.summary.totalFundingRequirementKrw, 0);
  assert.equal(plan.summary.deployedCapitalKrw, 0);
  assert.equal(plan.summary.unallocatedCapitalKrw, 5_000_000);
  assert.equal(plan.summary.coveragePct, 100);
  assert.equal(plan.summary.priorityWeightedMitigationPct, 100);
  assert.equal(plan.summary.atRiskCoveragePct, 100);
  assert.equal(plan.warnings.length, 1);
});
