import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

import { defaultScenario, demoContracts } from "../src/data/demo.ts";
import type { ContractRecord } from "../src/lib/domain.ts";

// The application uses bundler-style extensionless imports. This small Node 24
// test hook mirrors TypeScript's extension substitution without adding a runner.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const { analyzeContract, analyzePortfolio, normalizeContract, recommendFinancing, runScenario } =
  await import("../src/lib/analytics/index.ts");

const simpleContract: ContractRecord = {
  id: "test-simple",
  procurementId: "TEST-001",
  title: "균등 지급 테스트 계약",
  companyName: "테스트기업(가상)",
  companySize: "small",
  industry: "테스트",
  region: "서울",
  buyer: "테스트발주처",
  awardedAt: "2026-01-01",
  contractAmountKrw: 100_000_000,
  baseAmountKrw: 100_000_000,
  bidRatePct: 100,
  estimatedTotalCostKrw: 80_000_000,
  availableCashKrw: 500_000_000,
  monthlyOperatingCashOutflowKrw: 0,
  existingBorrowingsKrw: 0,
  monthlyDebtServiceKrw: 0,
  annualInterestRatePct: 5,
  durationMonths: 4,
  paymentDelayDays: 0,
  advancePaymentRatePct: 0,
  retentionRatePct: 0,
  guaranteeDepositRatePct: 0,
  upfrontCostRatePct: 0,
  fixedCostRatePct: 0,
  paymentSchedule: "monthly",
  dataQuality: "synthetic",
  isSynthetic: true,
};

test("baseline analysis produces a complete deterministic 12-month result", () => {
  const first = analyzeContract(simpleContract);
  const second = analyzeContract(simpleContract, defaultScenario);

  assert.deepEqual(first, second);
  assert.equal(first.monthlyCashflow.length, 12);
  assert.equal(first.adjustedRevenueKrw, 100_000_000);
  assert.equal(first.projectedCostKrw, 80_000_000);
  assert.equal(first.grossProfitKrw, 20_000_000);
  assert.equal(first.survivalMarginKrw, 20_000_000);
  assert.equal(first.breakEvenCostShockPct, 25);
  assert.equal(first.maximumTolerableCostIncreasePct, 25);
  assert.equal(first.peakCashShortfallKrw, 0);
  assert.equal(first.cashRunwayMonths, 12);
  assert.equal(first.totalInflows12mKrw, 100_000_000);
  assert.equal(first.remainingReceivablesAfter12mKrw, 0);
  assert.equal(first.riskContributions.length, 6);
});

test("normalization preserves supported 10-year contracts and two-year payment delays", () => {
  const normalized = normalizeContract({
    ...simpleContract,
    id: "upper-bounds",
    durationMonths: 120,
    paymentDelayDays: 730,
  });
  const clamped = normalizeContract({
    ...simpleContract,
    id: "over-upper-bounds",
    durationMonths: 999,
    paymentDelayDays: 9999,
  });
  const result = analyzeContract(normalized);
  const delayFactor = result.riskContributions.find(
    (factor) => factor.id === "payment-delay",
  );

  assert.equal(normalized.durationMonths, 120);
  assert.equal(normalized.paymentDelayDays, 730);
  assert.equal(clamped.durationMonths, 120);
  assert.equal(clamped.paymentDelayDays, 730);
  assert.equal(delayFactor?.displayValue, "730일");
  assert.equal(result.monthlyCashflow.length, 12);
  assert.equal(result.totalInflows12mKrw, 0);
});

test("cost, delay, rate and volume stress worsen survival and liquidity", () => {
  const contract = demoContracts.find((item) => item.id === "demo-005");
  assert.ok(contract);

  const comparison = runScenario(contract, {
    costInflationPct: 12,
    paymentDelayDays: 60,
    interestRateChangePctPoints: 3,
    orderVolumeChangePct: -15,
  });

  assert.ok(comparison.stressed.survivalMarginKrw < comparison.baseline.survivalMarginKrw);
  assert.ok(comparison.stressed.peakCashShortfallKrw >= comparison.baseline.peakCashShortfallKrw);
  assert.ok(comparison.stressed.riskScore >= comparison.baseline.riskScore);
  assert.ok(comparison.delta.fundingRequirementKrw >= 0);
});

test("fixed costs remain when order volume falls", () => {
  const contract = { ...simpleContract, fixedCostRatePct: 50 };
  const stressed = analyzeContract(contract, { orderVolumeChangePct: -50 });
  const cancelled = analyzeContract(contract, { orderVolumeChangePct: -100 });

  assert.equal(stressed.adjustedRevenueKrw, 50_000_000);
  // 50% fixed + half of the 50% variable portion = 75% of original cost.
  assert.equal(stressed.projectedCostKrw, 60_000_000);
  assert.equal(stressed.grossProfitKrw, -10_000_000);
  assert.equal(cancelled.adjustedRevenueKrw, 0);
  assert.equal(cancelled.projectedCostKrw, 40_000_000);
  assert.equal(cancelled.grossMarginPct, -100);
  assert.equal(cancelled.survivalMarginPct, -100);
  assert.equal(
    cancelled.riskContributions.find((factor) => factor.id === "margin")?.points,
    30,
  );
});

test("financing package covers the modelled requirement with layered instruments", () => {
  const contract = demoContracts.find((item) => item.id === "demo-007");
  assert.ok(contract);
  const analysis = analyzeContract(contract);
  const recommendation = recommendFinancing(contract, analysis);

  assert.ok(recommendation.fundingRequirementKrw > 0);
  assert.ok(recommendation.totalLiquidityPackageKrw >= recommendation.fundingRequirementKrw);
  assert.ok(recommendation.coveragePct >= 100);
  assert.ok(recommendation.workingCapitalLineKrw >= 0);
  assert.ok(recommendation.expectedFinancingCostKrw >= 0);
  assert.ok(recommendation.structure.every((item) => item.amountKrw > 0));
  assert.ok(recommendation.safeguards.length >= 3);

  const liquiditySources = recommendation.structure.filter(
    (item) => item.type !== "guarantee-reserve",
  );
  const sourceTotal = liquiditySources.reduce((total, item) => total + item.amountKrw, 0);
  const sourceShare = liquiditySources.reduce((total, item) => total + item.sharePct, 0);
  const guaranteeItem = recommendation.structure.find(
    (item) => item.type === "guarantee-reserve",
  );

  assert.equal(sourceTotal, recommendation.totalLiquidityPackageKrw);
  assert.ok(Math.abs(sourceShare - 100) <= 0.2);
  if (guaranteeItem) {
    assert.equal(guaranteeItem.amountKrw, recommendation.guaranteeReserveKrw);
    assert.equal(guaranteeItem.sharePct, 0);
  }
});

test("financing does not recommend new debt when projected cash already exceeds the buffer", () => {
  const cashRich: ContractRecord = {
    ...simpleContract,
    id: "test-cash-rich",
    availableCashKrw: 5_000_000_000,
    monthlyOperatingCashOutflowKrw: 0,
    existingBorrowingsKrw: 0,
    monthlyDebtServiceKrw: 0,
    guaranteeDepositRatePct: 0,
  };
  const result = analyzeContract(cashRich);

  assert.equal(result.financingRecommendation.fundingRequirementKrw, 0);
  assert.equal(result.financingRecommendation.totalLiquidityPackageKrw, 0);
});

test("exported financing helper enforces the model's 30% guarantee-reserve guard", () => {
  const analysis = analyzeContract(simpleContract);
  const recommendation = recommendFinancing(
    { ...simpleContract, guaranteeDepositRatePct: 100 },
    analysis,
  );

  assert.equal(recommendation.guaranteeReserveKrw, 30_000_000);
});

test("portfolio totals, risk distribution and concentrations reconcile", () => {
  const portfolio = analyzePortfolio(demoContracts);
  const distributionCount = Object.values(portfolio.riskDistribution).reduce(
    (total, count) => total + count,
    0,
  );
  const buyerShare = portfolio.buyerConcentration.reduce(
    (total, group) => total + group.sharePct,
    0,
  );

  assert.equal(portfolio.contractCount, 12);
  assert.equal(distributionCount, 12);
  assert.equal(portfolio.contracts.length, 12);
  assert.equal(portfolio.monthlyCashflow.length, 12);
  assert.ok(Math.abs(buyerShare - 100) <= 0.2);
  assert.ok(portfolio.topRiskContracts.length <= 5);
  assert.ok(
    portfolio.topRiskContracts.every(
      (item, index, values) => index === 0 || values[index - 1].riskScore >= item.riskScore,
    ),
  );
});

test("portfolio cashflow does not duplicate company cash and overhead across contracts", () => {
  const siblingContract: ContractRecord = {
    ...simpleContract,
    id: "test-simple-sibling",
    procurementId: "TEST-002",
    title: "동일 기업의 두 번째 계약",
  };
  const standalone = analyzeContract(simpleContract);
  const portfolio = analyzePortfolio([simpleContract, siblingContract]);
  const month = standalone.monthlyCashflow[0];
  const expectedEndingCash =
    simpleContract.availableCashKrw +
    2 * (month.contractInflowsKrw - month.contractCostsKrw + month.guaranteeMovementKrw) -
    month.operatingOutflowsKrw -
    month.debtServiceKrw -
    month.borrowingInterestKrw;

  assert.equal(portfolio.monthlyCashflow[0].endingCashBalanceKrw, expectedEndingCash);
});

test("contracts without a company name keep separate balance sheets", () => {
  const first: ContractRecord = {
    ...simpleContract,
    id: "unknown-company-one",
    procurementId: "UNKNOWN-001",
    companyName: "",
  };
  const second: ContractRecord = {
    ...first,
    // Even a duplicated/missing record key is not evidence that unnamed
    // companies share a balance sheet.
    id: first.id,
    procurementId: "UNKNOWN-002",
  };
  const standalone = analyzeContract(first);
  const month = standalone.monthlyCashflow[0];
  const portfolio = analyzePortfolio([first, second]);
  const expectedEndingCash =
    2 * first.availableCashKrw +
    2 * (month.contractInflowsKrw - month.contractCostsKrw + month.guaranteeMovementKrw) -
    2 * (month.operatingOutflowsKrw + month.debtServiceKrw + month.borrowingInterestKrw);

  assert.equal(portfolio.monthlyCashflow[0].endingCashBalanceKrw, expectedEndingCash);
});

test("guarantee deposit and release reconcile 12-month inflows, outflows and ending cash", () => {
  const guaranteed: ContractRecord = {
    ...simpleContract,
    id: "guarantee-roundtrip",
    durationMonths: 2,
    estimatedTotalCostKrw: 0,
    paymentDelayDays: 30,
    advancePaymentRatePct: 20,
    retentionRatePct: 10,
    guaranteeDepositRatePct: 10,
    paymentSchedule: "completion",
  };
  const result = analyzeContract(guaranteed);
  const finalCash = result.monthlyCashflow.at(-1)?.endingCashBalanceKrw;

  assert.equal(result.monthlyCashflow[0].contractInflowsKrw, 20_000_000);
  assert.equal(result.monthlyCashflow[0].guaranteeMovementKrw, -10_000_000);
  assert.equal(result.monthlyCashflow[3].guaranteeMovementKrw, 10_000_000);
  assert.equal(result.totalInflows12mKrw, 110_000_000);
  assert.equal(result.totalOutflows12mKrw, 10_000_000);
  assert.equal(finalCash, guaranteed.availableCashKrw + 100_000_000);
  assert.equal(
    result.totalInflows12mKrw - result.totalOutflows12mKrw,
    finalCash - guaranteed.availableCashKrw,
  );
});

test("factoring excludes future unearned installments on contracts longer than the horizon", () => {
  const longContract: ContractRecord = {
    ...simpleContract,
    id: "long-unearned-contract",
    durationMonths: 24,
    availableCashKrw: 0,
    estimatedTotalCostKrw: 80_000_000,
    paymentDelayDays: 60,
    paymentSchedule: "completion",
  };
  const result = analyzeContract(longContract);

  assert.equal(result.totalInflows12mKrw, 0);
  assert.equal(result.remainingReceivablesAfter12mKrw, 0);
  assert.equal(result.remainingContractValueAfter12mKrw, 100_000_000);
  assert.equal(result.financingRecommendation.factoringEligibleReceivablesKrw, 0);
  assert.equal(result.financingRecommendation.factoringRecommendedKrw, 0);
});

test("factoring uses only consideration earned by month 12 and collected later", () => {
  const delayedCompletion: ContractRecord = {
    ...simpleContract,
    id: "earned-delayed-contract",
    durationMonths: 10,
    availableCashKrw: 0,
    paymentDelayDays: 90,
    paymentSchedule: "completion",
  };
  const result = analyzeContract(delayedCompletion);

  assert.equal(result.totalInflows12mKrw, 0);
  assert.equal(result.remainingReceivablesAfter12mKrw, 100_000_000);
  assert.equal(result.remainingContractValueAfter12mKrw, 100_000_000);
  assert.equal(result.financingRecommendation.factoringEligibleReceivablesKrw, 80_000_000);
  assert.ok(result.financingRecommendation.factoringRecommendedKrw > 0);
});

test("payment-delay stress flows through financing duration and cost", () => {
  const delayedCompletion: ContractRecord = {
    ...simpleContract,
    id: "delay-financing-cost",
    durationMonths: 8,
    availableCashKrw: 0,
    existingBorrowingsKrw: 20_000_000,
    paymentDelayDays: 0,
    paymentSchedule: "completion",
  };
  const baseline = analyzeContract(delayedCompletion);
  const stressed = analyzeContract(delayedCompletion, { paymentDelayDays: 120 });

  assert.ok(
    stressed.financingRecommendation.expectedFinancingCostKrw >
      baseline.financingRecommendation.expectedFinancingCostKrw,
  );
  assert.ok(
    stressed.financingRecommendation.factoringEligibleReceivablesKrw >=
      baseline.financingRecommendation.factoringEligibleReceivablesKrw,
  );
});

test("zero revenue without a cash shortfall does not create a false liquidity penalty", () => {
  const cancelled = analyzeContract(simpleContract, { orderVolumeChangePct: -100 });
  const liquidity = cancelled.riskContributions.find((item) => item.id === "liquidity");

  assert.equal(cancelled.adjustedRevenueKrw, 0);
  assert.equal(cancelled.peakCashShortfallKrw, 0);
  assert.equal(liquidity?.points, 0);
});

test("zero modelled cost reports headroom within the supported stress range", () => {
  const zeroCost = analyzeContract({
    ...simpleContract,
    id: "zero-cost",
    estimatedTotalCostKrw: 0,
  });

  assert.equal(zeroCost.breakEvenCostShockPct, 200);
  assert.equal(zeroCost.remainingCostShockHeadroomPct, 200);
  assert.ok(!zeroCost.alerts.some((alert) => alert.includes("원가 상승")));
  assert.ok(zeroCost.alerts.some((alert) => alert.includes("예상 총원가가 0원")));
});

test("deterministic contract sweep preserves monotonicity and accounting invariants", () => {
  let state = 0x5eed1234;
  const random = () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
  const between = (minimum: number, maximum: number) =>
    minimum + (maximum - minimum) * random();
  const schedules: ContractRecord["paymentSchedule"][] = [
    "monthly",
    "milestone",
    "completion",
  ];

  for (let index = 0; index < 100; index += 1) {
    const amount = Math.round(between(1_000_000, 500_000_000));
    const contract: ContractRecord = {
      ...simpleContract,
      id: `sweep-${index}`,
      procurementId: `SWEEP-${index}`,
      contractAmountKrw: amount,
      baseAmountKrw: Math.round(amount / between(0.7, 1.05)),
      bidRatePct: between(70, 105),
      estimatedTotalCostKrw: Math.round(amount * between(0, 1.2)),
      availableCashKrw: Math.round(between(0, 200_000_000)),
      monthlyOperatingCashOutflowKrw: Math.round(between(0, 5_000_000)),
      existingBorrowingsKrw: Math.round(between(0, 300_000_000)),
      monthlyDebtServiceKrw: Math.round(between(0, 3_000_000)),
      annualInterestRatePct: between(0, 50),
      durationMonths: Math.round(between(1, 120)),
      paymentDelayDays: Math.round(between(0, 730)),
      advancePaymentRatePct: between(0, 30),
      retentionRatePct: between(0, 30),
      guaranteeDepositRatePct: between(0, 30),
      upfrontCostRatePct: between(0, 100),
      fixedCostRatePct: between(0, 100),
      paymentSchedule: schedules[index % schedules.length],
    };
    const baseline = analyzeContract(contract);
    const costStress = analyzeContract(contract, { costInflationPct: 20 });
    const delayStress = analyzeContract(contract, { paymentDelayDays: 60 });
    const rateStress = analyzeContract(contract, { interestRateChangePctPoints: 5 });

    for (const stressed of [costStress, delayStress, rateStress]) {
      assert.ok(stressed.survivalMarginKrw <= baseline.survivalMarginKrw + 1);
      assert.ok(stressed.peakCashShortfallKrw + 1 >= baseline.peakCashShortfallKrw);
      assert.ok(stressed.riskScore >= baseline.riskScore);
    }
    assert.ok(costStress.projectedCostKrw >= baseline.projectedCostKrw);

    const finalCash = baseline.monthlyCashflow.at(-1)?.endingCashBalanceKrw ?? 0;
    const cashMovement = finalCash - contract.availableCashKrw;
    assert.ok(
      Math.abs(cashMovement - (baseline.totalInflows12mKrw - baseline.totalOutflows12mKrw)) <= 50,
    );
    assert.ok(
      baseline.remainingReceivablesAfter12mKrw <=
        baseline.remainingContractValueAfter12mKrw + 12,
    );
    const contractCollections = baseline.monthlyCashflow.reduce(
      (total, month) => total + month.contractInflowsKrw,
      0,
    );
    assert.ok(
      Math.abs(
        contractCollections +
          baseline.remainingContractValueAfter12mKrw -
          baseline.adjustedRevenueKrw,
      ) <= 12,
    );

    const financing = baseline.financingRecommendation;
    const liquiditySources = financing.structure.filter(
      (item) => item.type !== "guarantee-reserve",
    );
    const liquiditySourceTotal = liquiditySources
      .reduce((total, item) => total + item.amountKrw, 0);
    assert.equal(liquiditySourceTotal, financing.totalLiquidityPackageKrw);
    assert.ok(financing.totalLiquidityPackageKrw >= financing.fundingRequirementKrw);
    if (financing.totalLiquidityPackageKrw > 0) {
      const sourceShare = liquiditySources.reduce(
        (total, item) => total + item.sharePct,
        0,
      );
      assert.ok(Math.abs(sourceShare - 100) <= 0.2);
    }
    assert.ok(
      financing.structure
        .filter((item) => item.type === "guarantee-reserve")
        .every((item) => item.sharePct === 0),
    );
  }
});

test("invalid numeric inputs are guarded and never leak NaN or Infinity", () => {
  const invalid: ContractRecord = {
    ...simpleContract,
    contractAmountKrw: Number.NaN,
    baseAmountKrw: Number.POSITIVE_INFINITY,
    estimatedTotalCostKrw: Number.NEGATIVE_INFINITY,
    availableCashKrw: Number.NaN,
    durationMonths: 0,
    annualInterestRatePct: Number.NaN,
  };
  const result = analyzeContract(invalid, {
    costInflationPct: Number.NaN,
    paymentDelayDays: Number.POSITIVE_INFINITY,
    interestRateChangePctPoints: Number.NaN,
    orderVolumeChangePct: Number.NEGATIVE_INFINITY,
  });

  const numericValues = [
    result.adjustedRevenueKrw,
    result.projectedCostKrw,
    result.survivalMarginKrw,
    result.breakEvenCostShockPct,
    result.remainingContractValueAfter12mKrw,
    result.riskScore,
    ...result.monthlyCashflow.flatMap((month) => [
      month.netCashflowKrw,
      month.endingCashBalanceKrw,
    ]),
  ];
  assert.ok(numericValues.every(Number.isFinite));
  assert.ok(result.riskScore >= 0 && result.riskScore <= 100);
});
