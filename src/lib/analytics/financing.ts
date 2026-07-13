import type {
  ContractAnalysis,
  ContractRecord,
  FinancingRecommendation,
  FinancingStructureItem,
} from "../domain";
import { clamp, finite, nonNegative, round, safeDivide } from "./math";

type AnalysisForFinancing = Pick<
  ContractAnalysis,
  | "adjustedRevenueKrw"
  | "projectedCostKrw"
  | "peakCashShortfallKrw"
  | "minimumCashBalanceKrw"
  | "remainingReceivablesAfter12mKrw"
  | "riskLevel"
  | "survivalMarginKrw"
  | "scenario"
>;

/**
 * Builds a layered liquidity package. Advance payments are exhausted first,
 * then receivables financing, with a revolving line covering the residual.
 * It is a decision-support estimate, not a credit approval or legal opinion.
 */
export function recommendFinancing(
  contract: ContractRecord,
  analysis: AnalysisForFinancing,
): FinancingRecommendation {
  const revenue = nonNegative(analysis.adjustedRevenueKrw);
  const projectedCost = nonNegative(analysis.projectedCostKrw);
  const currentAdvanceRate = clamp(contract.advancePaymentRatePct, 0, 100);
  const stressedRate = clamp(
    finite(contract.annualInterestRatePct) + finite(analysis.scenario.interestRateChangePctPoints),
    0,
    50,
  );
  const monthlyBorrowingInterest =
    nonNegative(contract.existingBorrowingsKrw) * (stressedRate / 100 / 12);
  const monthlyCommittedOutflow =
    nonNegative(contract.monthlyOperatingCashOutflowKrw) +
    nonNegative(contract.monthlyDebtServiceKrw) +
    monthlyBorrowingInterest;

  // One month of committed outflows or 3% of project cost, whichever is larger.
  const liquidityBuffer = Math.max(monthlyCommittedOutflow, projectedCost * 0.03);
  // Raise the projected minimum balance to the target buffer. A contract that
  // already stays above that buffer should not be assigned unnecessary debt.
  const fundingRequirement = nonNegative(
    liquidityBuffer - finite(analysis.minimumCashBalanceKrw),
  );

  const advanceRateNeeded = revenue > 0 ? safeDivide(fundingRequirement, revenue) * 100 : 0;
  const advanceCeiling = Math.max(currentAdvanceRate, 30);
  const targetAdvanceRate = clamp(
    Math.max(currentAdvanceRate, Math.min(advanceCeiling, currentAdvanceRate + advanceRateNeeded * 0.55)),
    currentAdvanceRate,
    100,
  );
  const additionalAdvance = Math.min(
    fundingRequirement,
    revenue * ((targetAdvanceRate - currentAdvanceRate) / 100),
  );

  const needAfterAdvance = nonNegative(fundingRequirement - additionalAdvance);
  // Future installments on long-running contracts are not yet receivables.
  // Apply the eligibility haircut only to consideration earned by month 12
  // whose scheduled collection falls beyond the model horizon.
  const factoringEligible = nonNegative(
    analysis.remainingReceivablesAfter12mKrw,
  ) * 0.8;
  const factoringRecommended = Math.min(
    needAfterAdvance,
    factoringEligible,
    revenue * 0.25,
  );

  const needAfterFactoring = nonNegative(needAfterAdvance - factoringRecommended);
  // A 10% undrawn contingency protects against timing/model error.
  const workingCapitalLine = needAfterFactoring * 1.1;
  const guaranteeReserve = revenue * (clamp(contract.guaranteeDepositRatePct, 0, 30) / 100);

  const effectivePaymentDelayDays = clamp(
    finite(contract.paymentDelayDays) + finite(analysis.scenario.paymentDelayDays),
    0,
    730,
  );
  const fundingMonths = clamp(
    Math.ceil(nonNegative(contract.durationMonths) + effectivePaymentDelayDays / 30),
    1,
    12,
  );
  const lineCost = workingCapitalLine * 0.55 * (stressedRate / 100) * (fundingMonths / 12);
  const factoringFeeRate =
    0.012 + stressedRate / 100 * effectivePaymentDelayDays / 365;
  const factoringCost = factoringRecommended * factoringFeeRate;
  const advanceGuaranteeCost = additionalAdvance * 0.003;
  const expectedFinancingCost = lineCost + factoringCost + advanceGuaranteeCost;

  const roundedFundingRequirement = round(fundingRequirement);
  const roundedAdditionalAdvance = round(additionalAdvance);
  const roundedFactoringRecommended = round(factoringRecommended);
  let roundedWorkingCapitalLine = round(workingCapitalLine);
  const roundedSourceTotal =
    roundedAdditionalAdvance + roundedFactoringRecommended + roundedWorkingCapitalLine;
  if (roundedSourceTotal < roundedFundingRequirement) {
    roundedWorkingCapitalLine += roundedFundingRequirement - roundedSourceTotal;
  }
  const roundedTotalPackage =
    roundedAdditionalAdvance + roundedFactoringRecommended + roundedWorkingCapitalLine;

  const rawStructure: FinancingStructureItem[] = [
    {
      type: "advance-payment",
      label: "발주처 선금 증액",
      amountKrw: roundedAdditionalAdvance,
      sharePct: 0,
      priority: 1,
      purpose: "착수 단계의 선투입 비용을 비차입성 자금으로 충당",
    },
    {
      type: "receivables-factoring",
      label: "확정 매출채권 팩토링",
      amountKrw: roundedFactoringRecommended,
      sharePct: 0,
      priority: 2,
      purpose: "검수 완료 채권의 회수 지연을 현금화",
    },
    {
      type: "working-capital-line",
      label: "한도형 운전자금",
      amountKrw: roundedWorkingCapitalLine,
      sharePct: 0,
      priority: 3,
      purpose: "잔여 자금 공백과 10% 일정 오차 버퍼를 흡수",
    },
    {
      type: "guarantee-reserve",
      label: "보증·담보 예치 관리",
      amountKrw: round(guaranteeReserve),
      sharePct: 0,
      priority: 4,
      purpose: "계약 보증금의 별도 예치 및 반환 시점 추적",
    },
  ];
  const structure = rawStructure
    .filter((item) => item.amountKrw > 0)
    .map((item) => ({
      ...item,
      // The reserve is restricted cash already reflected in the projected
      // minimum balance, not an additional liquidity source.
      sharePct: item.type === "guarantee-reserve"
        ? 0
        : round(safeDivide(item.amountKrw, roundedTotalPackage) * 100, 1),
    }));

  const rationale = [
    `향후 12개월 최저 예상 현금잔액을 1개월 최소 유동성 버퍼까지 끌어올리는 차액으로 필요자금을 산정했습니다.`,
    `선금 → 확정채권 팩토링 → 한도대출 순으로 조달비용과 부채 증가를 억제했습니다.`,
    `운전자금 한도에는 예상치 못한 원가·검수 일정 오차를 위한 10% 미사용 여유분을 포함했습니다.`,
  ];
  const safeguards = [
    "발주처 지급계좌를 상환 전용계좌로 지정하고 입금액을 자동 상환에 우선 배분",
    "월별 원가율과 공정률을 함께 점검하고 예상 원가가 손익분기 원가를 넘으면 추가 인출 중단",
    "검수 지연, 계약 변경, 보증금 반환 일정 발생 시 자금 한도를 즉시 재산정",
  ];
  const warnings: string[] = [];
  if (analysis.survivalMarginKrw < 0) {
    warnings.push("금융 지원만으로 계약 손실이 해소되지 않습니다. 단가·범위 재협상이 선행되어야 합니다.");
  }
  if (analysis.riskLevel === "critical") {
    warnings.push("위험도가 심각 단계입니다. 자동 승인 대신 수동 심사와 발주처 확인이 필요합니다.");
  }
  if (factoringRecommended > 0) {
    warnings.push("팩토링 가능액은 검수·채권양도 제한 및 발주처 승낙 여부를 확인한 뒤 확정해야 합니다.");
  }
  if (contract.dataQuality !== "verified") {
    warnings.push("추정 또는 합성 입력값이 포함되어 실제 원가명세와 지급조건 검증 전에는 실행할 수 없습니다.");
  }

  return {
    fundingRequirementKrw: roundedFundingRequirement,
    liquidityBufferKrw: round(liquidityBuffer),
    workingCapitalLineKrw: roundedWorkingCapitalLine,
    safeWorkingCapitalLimitKrw: roundedWorkingCapitalLine,
    targetAdvancePaymentRatePct: round(targetAdvanceRate, 1),
    additionalAdvanceRequestKrw: roundedAdditionalAdvance,
    factoringEligibleReceivablesKrw: round(factoringEligible),
    factoringRecommendedKrw: roundedFactoringRecommended,
    guaranteeReserveKrw: round(guaranteeReserve),
    totalLiquidityPackageKrw: roundedTotalPackage,
    expectedFinancingCostKrw: round(expectedFinancingCost),
    coveragePct: roundedFundingRequirement > 0
      ? round(safeDivide(roundedTotalPackage, roundedFundingRequirement) * 100, 1)
      : 100,
    structure,
    rationale,
    safeguards,
    warnings,
  };
}
