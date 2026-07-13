import type {
  ContractAnalysis,
  ContractRecord,
  MonthlyCashflow,
  RiskContribution,
  RiskLevel,
  ScenarioComparison,
  ScenarioInputs,
} from "../domain";
import { recommendFinancing } from "./financing";
import { clamp, finite, formatKrw, formatPct, nonNegative, round, safeDivide, sum } from "./math";

export const ZERO_SCENARIO: Readonly<ScenarioInputs> = Object.freeze({
  costInflationPct: 0,
  paymentDelayDays: 0,
  interestRateChangePctPoints: 0,
  orderVolumeChangePct: 0,
});

export function sanitizeScenario(scenario: Partial<ScenarioInputs> = {}): ScenarioInputs {
  return {
    costInflationPct: clamp(finite(scenario.costInflationPct ?? 0), -50, 200),
    paymentDelayDays: clamp(finite(scenario.paymentDelayDays ?? 0), -365, 365),
    interestRateChangePctPoints: clamp(
      finite(scenario.interestRateChangePctPoints ?? 0),
      -20,
      30,
    ),
    orderVolumeChangePct: clamp(finite(scenario.orderVolumeChangePct ?? 0), -100, 200),
  };
}

export function normalizeContract(contract: ContractRecord): ContractRecord {
  const duration = Math.round(clamp(contract.durationMonths, 1, 120));
  const amount = nonNegative(contract.contractAmountKrw);
  const baseAmount = nonNegative(contract.baseAmountKrw);
  const inferredBidRate = baseAmount > 0 ? safeDivide(amount, baseAmount) * 100 : 100;

  return {
    ...contract,
    id: contract.id || "unknown-contract",
    procurementId: contract.procurementId || "미입력",
    title: contract.title || "제목 미입력 계약",
    companyName: contract.companyName || "기업명 미입력",
    industry: contract.industry || "미분류",
    region: contract.region || "미입력",
    buyer: contract.buyer || "발주처 미입력",
    awardedAt: contract.awardedAt || "",
    contractAmountKrw: amount,
    baseAmountKrw: baseAmount,
    bidRatePct: clamp(finite(contract.bidRatePct, inferredBidRate), 0, 200),
    estimatedTotalCostKrw: nonNegative(contract.estimatedTotalCostKrw),
    availableCashKrw: nonNegative(contract.availableCashKrw),
    monthlyOperatingCashOutflowKrw: nonNegative(contract.monthlyOperatingCashOutflowKrw),
    existingBorrowingsKrw: nonNegative(contract.existingBorrowingsKrw),
    monthlyDebtServiceKrw: nonNegative(contract.monthlyDebtServiceKrw),
    annualInterestRatePct: clamp(contract.annualInterestRatePct, 0, 50),
    durationMonths: duration,
    paymentDelayDays: clamp(contract.paymentDelayDays, 0, 730),
    advancePaymentRatePct: clamp(contract.advancePaymentRatePct, 0, 100),
    retentionRatePct: clamp(contract.retentionRatePct, 0, 30),
    guaranteeDepositRatePct: clamp(contract.guaranteeDepositRatePct, 0, 30),
    upfrontCostRatePct: clamp(contract.upfrontCostRatePct, 0, 100),
    fixedCostRatePct: clamp(contract.fixedCostRatePct, 0, 100),
    dataQuality: contract.isSynthetic ? "synthetic" : contract.dataQuality,
    isSynthetic: Boolean(contract.isSynthetic),
  };
}

function factorSeverity(points: number, maximum: number): RiskLevel {
  const ratio = safeDivide(points, maximum);
  if (ratio >= 0.75) return "critical";
  if (ratio >= 0.5) return "high";
  if (ratio >= 0.25) return "caution";
  return "low";
}

export function getRiskLevel(score: number): RiskLevel {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "caution";
  return "low";
}

export function getRiskLabel(level: RiskLevel): string {
  return {
    low: "안정",
    caution: "관찰",
    high: "주의",
    critical: "위험",
  }[level];
}

interface CashflowInputs {
  adjustedRevenueKrw: number;
  projectedCostKrw: number;
  stressedInterestRatePct: number;
  effectivePaymentDelayDays: number;
}

interface CashflowProjection {
  months: MonthlyCashflow[];
  earnedUncollectedAfterHorizonKrw: number;
}

function buildCashflow(contract: ContractRecord, inputs: CashflowInputs): CashflowProjection {
  const horizon = 12;
  const duration = contract.durationMonths;
  const lagMonths = Math.ceil(inputs.effectivePaymentDelayDays / 30);
  const inflows = Array.from({ length: horizon }, () => 0);
  const costs = Array.from({ length: horizon }, () => 0);
  const guaranteeMovements = Array.from({ length: horizon }, () => 0);
  let earnedUncollectedAfterHorizon = 0;

  const advance = inputs.adjustedRevenueKrw * (contract.advancePaymentRatePct / 100);
  inflows[0] += advance;
  const paymentPool = nonNegative(inputs.adjustedRevenueKrw - advance);
  const retention = paymentPool * (contract.retentionRatePct / 100);
  const progressPool = nonNegative(paymentPool - retention);

  const addInflow = (oneBasedEarnedMonth: number, amountKrw: number, extraDelay = 0) => {
    const paidMonth = oneBasedEarnedMonth + lagMonths + extraDelay;
    if (paidMonth >= 1 && paidMonth <= horizon) inflows[paidMonth - 1] += amountKrw;
    if (oneBasedEarnedMonth <= horizon && paidMonth > horizon) {
      earnedUncollectedAfterHorizon += amountKrw;
    }
  };

  if (contract.paymentSchedule === "monthly") {
    const monthlyProgress = safeDivide(progressPool, duration);
    for (let month = 1; month <= duration; month += 1) addInflow(month, monthlyProgress);
  } else if (contract.paymentSchedule === "milestone") {
    const milestones = [
      { month: Math.max(1, Math.ceil(duration / 3)), weight: 0.3 },
      { month: Math.max(1, Math.ceil((duration * 2) / 3)), weight: 0.3 },
      { month: duration, weight: 0.4 },
    ];
    for (const milestone of milestones) addInflow(milestone.month, progressPool * milestone.weight);
  } else {
    addInflow(duration, progressPool);
  }
  addInflow(duration, retention, 1);

  const upfrontCost = inputs.projectedCostKrw * (contract.upfrontCostRatePct / 100);
  costs[0] += upfrontCost;
  const monthlyExecutionCost = safeDivide(nonNegative(inputs.projectedCostKrw - upfrontCost), duration);
  for (let month = 1; month <= Math.min(duration, horizon); month += 1) {
    costs[month - 1] += monthlyExecutionCost;
  }

  const guaranteeDeposit = inputs.adjustedRevenueKrw * (contract.guaranteeDepositRatePct / 100);
  guaranteeMovements[0] -= guaranteeDeposit;
  const guaranteeReleaseMonth = duration + lagMonths + 1;
  if (guaranteeReleaseMonth <= horizon) guaranteeMovements[guaranteeReleaseMonth - 1] += guaranteeDeposit;

  const monthlyInterest =
    contract.existingBorrowingsKrw * (inputs.stressedInterestRatePct / 100 / 12);
  let endingBalance = contract.availableCashKrw;
  let cumulativeProjectCashflow = 0;
  let cumulativeInflows = 0;

  const months = Array.from({ length: horizon }, (_, index) => {
    cumulativeInflows += inflows[index];
    cumulativeProjectCashflow += inflows[index] - costs[index] + guaranteeMovements[index];
    const netCashflow =
      inflows[index] -
      costs[index] -
      contract.monthlyOperatingCashOutflowKrw -
      contract.monthlyDebtServiceKrw -
      monthlyInterest +
      guaranteeMovements[index];
    endingBalance += netCashflow;

    return {
      month: index + 1,
      label: `${index + 1}개월`,
      contractInflowsKrw: round(inflows[index]),
      contractCostsKrw: round(costs[index]),
      operatingOutflowsKrw: round(contract.monthlyOperatingCashOutflowKrw),
      debtServiceKrw: round(contract.monthlyDebtServiceKrw),
      borrowingInterestKrw: round(monthlyInterest),
      guaranteeMovementKrw: round(guaranteeMovements[index]),
      netCashflowKrw: round(netCashflow),
      endingCashBalanceKrw: round(endingBalance),
      cumulativeProjectCashflowKrw: round(cumulativeProjectCashflow),
      outstandingContractValueKrw: round(
        nonNegative(inputs.adjustedRevenueKrw - cumulativeInflows),
      ),
    };
  });

  return {
    months,
    earnedUncollectedAfterHorizonKrw: round(earnedUncollectedAfterHorizon),
  };
}

interface RiskInputs {
  contract: ContractRecord;
  survivalMarginPct: number;
  peakCashShortfallKrw: number;
  adjustedRevenueKrw: number;
  stressedInterestRatePct: number;
  effectivePaymentDelayDays: number;
}

function buildRiskContributions(inputs: RiskInputs): RiskContribution[] {
  const marginPoints = clamp(((12 - inputs.survivalMarginPct) / 22) * 30, 0, 30);
  const shortfallRatio = safeDivide(
    inputs.peakCashShortfallKrw,
    inputs.adjustedRevenueKrw,
    inputs.peakCashShortfallKrw > 0 ? 1 : 0,
  );
  const liquidityPoints = clamp((shortfallRatio / 0.25) * 25, 0, 25);
  const delayPoints = clamp((inputs.effectivePaymentDelayDays / 120) * 15, 0, 15);
  const monthlyRevenue = safeDivide(inputs.adjustedRevenueKrw, inputs.contract.durationMonths);
  const debtBurden =
    inputs.contract.monthlyDebtServiceKrw +
    inputs.contract.existingBorrowingsKrw * (inputs.stressedInterestRatePct / 100 / 12);
  const debtBurdenRatio = safeDivide(debtBurden, monthlyRevenue, debtBurden > 0 ? 1 : 0);
  const debtPoints = clamp(debtBurdenRatio / 0.35, 0, 1) * 7 +
    clamp(inputs.stressedInterestRatePct / 15, 0, 1) * 3;
  const bidPoints = clamp(((92 - inputs.contract.bidRatePct) / 15) * 10, 0, 10);
  const executionPoints =
    (inputs.contract.paymentSchedule === "completion" ? 4 : inputs.contract.paymentSchedule === "milestone" ? 2 : 0) +
    clamp((inputs.contract.upfrontCostRatePct - 10) / 40, 0, 1) * 3 +
    clamp((inputs.contract.durationMonths - 6) / 18, 0, 1) * 3;

  const factors: Array<Omit<RiskContribution, "severity">> = [
    {
      id: "margin",
      label: "계약 생존마진",
      points: round(marginPoints, 1),
      maxPoints: 30,
      displayValue: formatPct(inputs.survivalMarginPct),
      explanation: "금융비용 반영 생존마진이 12% 아래로 내려갈수록 위험점수가 증가합니다.",
    },
    {
      id: "liquidity",
      label: "현금 부족",
      points: round(liquidityPoints, 1),
      maxPoints: 25,
      displayValue: formatKrw(inputs.peakCashShortfallKrw),
      explanation: "12개월 최대 현금 부족액을 조정 매출액 대비 비율로 평가합니다.",
    },
    {
      id: "payment-delay",
      label: "대금 회수 지연",
      points: round(delayPoints, 1),
      maxPoints: 15,
      displayValue: `${round(inputs.effectivePaymentDelayDays)}일`,
      explanation: "검수·지급 지연이 120일에 가까워질수록 만점 위험으로 반영합니다.",
    },
    {
      id: "debt-burden",
      label: "부채 상환부담",
      points: round(debtPoints, 1),
      maxPoints: 10,
      displayValue: formatPct(debtBurdenRatio * 100),
      explanation: "월평균 계약매출 대비 원리금·이자 부담과 금리 수준을 함께 반영합니다.",
    },
    {
      id: "bid-discount",
      label: "저가 낙찰",
      points: round(bidPoints, 1),
      maxPoints: 10,
      displayValue: formatPct(inputs.contract.bidRatePct),
      explanation: "기초금액 대비 낙찰률이 92% 아래로 낮아질수록 원가 오차 위험을 높게 봅니다.",
    },
    {
      id: "execution",
      label: "집행 구조",
      points: round(executionPoints, 1),
      maxPoints: 10,
      displayValue: `${inputs.contract.durationMonths}개월 · ${inputs.contract.paymentSchedule}`,
      explanation: "준공 후 일괄지급, 높은 선투입률, 긴 수행기간에 따른 실행 위험입니다.",
    },
  ];

  return factors.map((factor) => ({
    ...factor,
    severity: factorSeverity(factor.points, factor.maxPoints),
  }));
}

export function analyzeContract(
  rawContract: ContractRecord,
  rawScenario: Partial<ScenarioInputs> = ZERO_SCENARIO,
): ContractAnalysis {
  const contract = normalizeContract(rawContract);
  const scenario = sanitizeScenario(rawScenario);
  const volumeFactor = nonNegative(1 + scenario.orderVolumeChangePct / 100);
  const adjustedRevenue = contract.contractAmountKrw * volumeFactor;
  const fixedCostShare = contract.fixedCostRatePct / 100;
  const volumeAdjustedBaseCost =
    contract.estimatedTotalCostKrw *
    (fixedCostShare + (1 - fixedCostShare) * volumeFactor);
  const projectedCost = volumeAdjustedBaseCost * nonNegative(1 + scenario.costInflationPct / 100);
  const stressedInterestRate = clamp(
    contract.annualInterestRatePct + scenario.interestRateChangePctPoints,
    0,
    50,
  );
  const effectivePaymentDelay = clamp(contract.paymentDelayDays + scenario.paymentDelayDays, 0, 730);
  const cashflowProjection = buildCashflow(contract, {
    adjustedRevenueKrw: adjustedRevenue,
    projectedCostKrw: projectedCost,
    stressedInterestRatePct: stressedInterestRate,
    effectivePaymentDelayDays: effectivePaymentDelay,
  });
  const monthlyCashflow = cashflowProjection.months;

  const minimumCashBalance = Math.min(
    contract.availableCashKrw,
    ...monthlyCashflow.map((month) => month.endingCashBalanceKrw),
  );
  const peakCashShortfall = nonNegative(-minimumCashBalance);
  const fundingMonths = clamp(Math.ceil(contract.durationMonths + effectivePaymentDelay / 30), 1, 12);
  const estimatedFinancingCost =
    peakCashShortfall * (stressedInterestRate / 100) * (fundingMonths / 12) * 0.55;
  const grossProfit = adjustedRevenue - projectedCost;
  const survivalMargin = grossProfit - estimatedFinancingCost;
  const grossMarginPct = adjustedRevenue > 0
    ? safeDivide(grossProfit, adjustedRevenue) * 100
    : grossProfit < 0
      ? -100
      : 0;
  const survivalMarginPct = adjustedRevenue > 0
    ? safeDivide(survivalMargin, adjustedRevenue) * 100
    : survivalMargin < 0
      ? -100
      : 0;
  // With revenue but no modelled cost, no finite percentage shock reaches
  // break-even. Report the maximum supported stress (+200%) instead of the
  // misleading -100% produced by a zero-denominator fallback.
  const breakEvenShock = volumeAdjustedBaseCost > 0
    ? safeDivide(adjustedRevenue, volumeAdjustedBaseCost) * 100 - 100
    : adjustedRevenue > 0
      ? 200
      : 0;
  const remainingShockHeadroom = projectedCost > 0
    ? safeDivide(adjustedRevenue, projectedCost) * 100 - 100
    : adjustedRevenue > 0
      ? 200
      : 0;
  const firstNegativeMonth = monthlyCashflow.find((month) => month.endingCashBalanceKrw < 0)?.month;
  const cashRunwayMonths = firstNegativeMonth ? firstNegativeMonth - 1 : 12;
  const cashRunwayLabel = firstNegativeMonth
    ? firstNegativeMonth === 1
      ? "1개월 미만"
      : `${firstNegativeMonth - 1}개월`
    : "12개월 이상";
  const totalContractCollections = sum(
    monthlyCashflow.map((month) => month.contractInflowsKrw),
  );
  const totalInflows = totalContractCollections + sum(
    monthlyCashflow.map((month) => nonNegative(month.guaranteeMovementKrw)),
  );
  const totalOutflows = sum(
    monthlyCashflow.map(
      (month) =>
        month.contractCostsKrw +
        month.operatingOutflowsKrw +
        month.debtServiceKrw +
        month.borrowingInterestKrw +
        nonNegative(-month.guaranteeMovementKrw),
    ),
  );
  const remainingContractValue = nonNegative(adjustedRevenue - totalContractCollections);
  const remainingReceivables = nonNegative(
    cashflowProjection.earnedUncollectedAfterHorizonKrw,
  );
  const riskContributions = buildRiskContributions({
    contract,
    survivalMarginPct,
    peakCashShortfallKrw: peakCashShortfall,
    adjustedRevenueKrw: adjustedRevenue,
    stressedInterestRatePct: stressedInterestRate,
    effectivePaymentDelayDays: effectivePaymentDelay,
  });
  const riskScore = clamp(round(sum(riskContributions.map((factor) => factor.points)), 1), 0, 100);
  const riskLevel = getRiskLevel(riskScore);

  const alerts: string[] = [];
  if (survivalMargin < 0) alerts.push("금융비용 반영 후 계약 생존마진이 음수입니다.");
  if (peakCashShortfall > 0) alerts.push(`${formatKrw(peakCashShortfall)}의 최대 자금 공백이 예상됩니다.`);
  if (adjustedRevenue > 0 && volumeAdjustedBaseCost === 0) {
    alerts.push("예상 총원가가 0원이라 손익분기 원가충격을 산정할 수 없습니다. 200%는 모델 표시 상한이므로 원가 입력을 검증해야 합니다.");
  }
  if (remainingReceivables > adjustedRevenue * 0.2) {
    alerts.push("12개월 시점 기성·미회수 계약대금이 조정 매출의 20%를 초과합니다.");
  }
  if (breakEvenShock < 5) alerts.push("추가 원가 상승을 견딜 수 있는 여력이 5% 미만입니다.");
  if (contract.dataQuality !== "verified") alerts.push("검증되지 않은 입력값은 실제 증빙으로 교체해야 합니다.");

  const assumptions = [
    "분석 통화는 원(KRW), 예측 기간은 계약 시작 후 12개월입니다.",
    "예상 총원가는 계약 직접·프로젝트 원가이며 회사 운영비와 기존 원리금은 현금흐름에서 별도 반영합니다.",
    "주문량 충격은 매출과 변동원가에 적용하고 고정원가는 유지합니다.",
    "월 예정 채무상환액은 별도 계산되는 기존 차입이자를 제외한 고정 현금유출로 해석합니다.",
    "월 지급은 공정률 균등, 단계 지급은 30%·30%·40%, 완성 지급은 준공 시점으로 가정합니다.",
    "선금은 총 계약대금에서 차감하고 유보금은 준공 대금 지급 1개월 뒤 회수한다고 가정합니다.",
    "12개월 이후 잔여 계약대금과 12개월 내 기성·미회수 채권을 구분하며 팩토링은 후자만 대상으로 합니다.",
    "추가 금융비용은 최대 부족액의 평균 55%가 예상 자금기간 동안 인출된다는 보수적 근사치입니다.",
  ];

  const withoutFinancing = {
    contractId: contract.id,
    procurementId: contract.procurementId,
    companyName: contract.companyName,
    contractTitle: contract.title,
    scenario,
    contractAmountKrw: round(contract.contractAmountKrw),
    adjustedRevenueKrw: round(adjustedRevenue),
    projectedCostKrw: round(projectedCost),
    grossProfitKrw: round(grossProfit),
    grossMarginPct: round(grossMarginPct, 1),
    estimatedFinancingCostKrw: round(estimatedFinancingCost),
    survivalMarginKrw: round(survivalMargin),
    survivalMarginPct: round(survivalMarginPct, 1),
    breakEvenCostShockPct: round(breakEvenShock, 1),
    remainingCostShockHeadroomPct: round(remainingShockHeadroom, 1),
    maximumTolerableCostIncreasePct: round(breakEvenShock, 1),
    minimumCashBalanceKrw: round(minimumCashBalance),
    peakCashShortfallKrw: round(peakCashShortfall),
    cashRunwayMonths,
    cashRunwayLabel,
    totalInflows12mKrw: round(totalInflows),
    totalOutflows12mKrw: round(totalOutflows),
    remainingReceivablesAfter12mKrw: round(remainingReceivables),
    remainingContractValueAfter12mKrw: round(remainingContractValue),
    riskScore,
    riskLevel,
    riskLabel: getRiskLabel(riskLevel),
    riskContributions,
    monthlyCashflow,
    alerts,
    assumptions,
  };
  const financingRecommendation = recommendFinancing(contract, withoutFinancing);

  return { ...withoutFinancing, financingRecommendation };
}

export function runScenario(
  contract: ContractRecord,
  scenario: Partial<ScenarioInputs>,
): ScenarioComparison {
  const sanitized = sanitizeScenario(scenario);
  const baseline = analyzeContract(contract, ZERO_SCENARIO);
  const stressed = analyzeContract(contract, sanitized);
  return {
    contractId: contract.id,
    scenario: sanitized,
    baseline,
    stressed,
    delta: {
      riskScore: round(stressed.riskScore - baseline.riskScore, 1),
      survivalMarginKrw: round(stressed.survivalMarginKrw - baseline.survivalMarginKrw),
      peakCashShortfallKrw: round(stressed.peakCashShortfallKrw - baseline.peakCashShortfallKrw),
      cashRunwayMonths: stressed.cashRunwayMonths - baseline.cashRunwayMonths,
      fundingRequirementKrw: round(
        stressed.financingRecommendation.fundingRequirementKrw -
          baseline.financingRecommendation.fundingRequirementKrw,
      ),
    },
  };
}
