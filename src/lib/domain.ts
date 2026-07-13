export type CompanySize = "micro" | "small" | "medium" | "large";

export type PaymentSchedule = "monthly" | "milestone" | "completion";

export type DataQuality = "verified" | "estimated" | "synthetic";

export type RiskLevel = "low" | "caution" | "high" | "critical";

/**
 * All monetary fields use KRW and all percentage fields use percentage points.
 * `estimatedTotalCostKrw` contains contract-specific costs only. Company-wide
 * operating costs are modelled separately in the liquidity schedule.
 */
export interface ContractRecord {
  id: string;
  procurementId: string;
  title: string;
  companyName: string;
  companySize: CompanySize;
  industry: string;
  region: string;
  buyer: string;
  awardedAt: string;
  contractAmountKrw: number;
  baseAmountKrw: number;
  bidRatePct: number;
  estimatedTotalCostKrw: number;
  availableCashKrw: number;
  monthlyOperatingCashOutflowKrw: number;
  existingBorrowingsKrw: number;
  monthlyDebtServiceKrw: number;
  annualInterestRatePct: number;
  durationMonths: number;
  paymentDelayDays: number;
  advancePaymentRatePct: number;
  retentionRatePct: number;
  guaranteeDepositRatePct: number;
  upfrontCostRatePct: number;
  fixedCostRatePct: number;
  paymentSchedule: PaymentSchedule;
  dataQuality: DataQuality;
  isSynthetic: boolean;
  description?: string;
}

/** Stress values are deltas from the contract's base assumptions. */
export interface ScenarioInputs {
  costInflationPct: number;
  paymentDelayDays: number;
  interestRateChangePctPoints: number;
  orderVolumeChangePct: number;
}

export interface MonthlyCashflow {
  month: number;
  label: string;
  contractInflowsKrw: number;
  contractCostsKrw: number;
  operatingOutflowsKrw: number;
  debtServiceKrw: number;
  borrowingInterestKrw: number;
  guaranteeMovementKrw: number;
  netCashflowKrw: number;
  endingCashBalanceKrw: number;
  cumulativeProjectCashflowKrw: number;
  outstandingContractValueKrw: number;
}

export interface RiskContribution {
  id:
    | "margin"
    | "liquidity"
    | "payment-delay"
    | "debt-burden"
    | "bid-discount"
    | "execution";
  label: string;
  points: number;
  maxPoints: number;
  severity: RiskLevel;
  displayValue: string;
  explanation: string;
}

export type FinancingInstrument =
  | "advance-payment"
  | "receivables-factoring"
  | "working-capital-line"
  | "guarantee-reserve";

export interface FinancingStructureItem {
  type: FinancingInstrument;
  label: string;
  amountKrw: number;
  /** Share of new liquidity sources; restricted guarantee reserves report 0%. */
  sharePct: number;
  priority: number;
  purpose: string;
}

export interface FinancingRecommendation {
  fundingRequirementKrw: number;
  liquidityBufferKrw: number;
  workingCapitalLineKrw: number;
  safeWorkingCapitalLimitKrw: number;
  targetAdvancePaymentRatePct: number;
  additionalAdvanceRequestKrw: number;
  factoringEligibleReceivablesKrw: number;
  factoringRecommendedKrw: number;
  /** Restricted cash tracked separately; not a source of new liquidity. */
  guaranteeReserveKrw: number;
  /** Sum of advance, factoring and working-capital sources; excludes reserves. */
  totalLiquidityPackageKrw: number;
  expectedFinancingCostKrw: number;
  coveragePct: number;
  structure: FinancingStructureItem[];
  rationale: string[];
  safeguards: string[];
  warnings: string[];
}

export interface ContractAnalysis {
  contractId: string;
  procurementId: string;
  companyName: string;
  contractTitle: string;
  scenario: ScenarioInputs;
  contractAmountKrw: number;
  adjustedRevenueKrw: number;
  projectedCostKrw: number;
  grossProfitKrw: number;
  grossMarginPct: number;
  estimatedFinancingCostKrw: number;
  survivalMarginKrw: number;
  survivalMarginPct: number;
  breakEvenCostShockPct: number;
  remainingCostShockHeadroomPct: number;
  maximumTolerableCostIncreasePct: number;
  minimumCashBalanceKrw: number;
  peakCashShortfallKrw: number;
  cashRunwayMonths: number;
  cashRunwayLabel: string;
  totalInflows12mKrw: number;
  totalOutflows12mKrw: number;
  /** Scheduled consideration earned by month 12 but collected after month 12. */
  remainingReceivablesAfter12mKrw: number;
  /**
   * All uncollected contract consideration at month 12, including future
   * installments not yet earned on contracts longer than the model horizon.
   */
  remainingContractValueAfter12mKrw: number;
  riskScore: number;
  riskLevel: RiskLevel;
  riskLabel: string;
  riskContributions: RiskContribution[];
  monthlyCashflow: MonthlyCashflow[];
  financingRecommendation: FinancingRecommendation;
  alerts: string[];
  assumptions: string[];
}

export interface ScenarioComparison {
  contractId: string;
  scenario: ScenarioInputs;
  baseline: ContractAnalysis;
  stressed: ContractAnalysis;
  delta: {
    riskScore: number;
    survivalMarginKrw: number;
    peakCashShortfallKrw: number;
    cashRunwayMonths: number;
    fundingRequirementKrw: number;
  };
}

export interface PortfolioCashflow {
  month: number;
  label: string;
  inflowsKrw: number;
  outflowsKrw: number;
  netCashflowKrw: number;
  endingCashBalanceKrw: number;
}

export interface PortfolioConcentration {
  name: string;
  amountKrw: number;
  sharePct: number;
  contractCount: number;
}

export interface PortfolioAnalysis {
  scenario: ScenarioInputs;
  contracts: ContractAnalysis[];
  contractCount: number;
  totalContractAmountKrw: number;
  totalAdjustedRevenueKrw: number;
  totalProjectedCostKrw: number;
  totalSurvivalMarginKrw: number;
  totalFundingRequirementKrw: number;
  weightedRiskScore: number;
  riskLevel: RiskLevel;
  riskLabel: string;
  riskDistribution: Record<RiskLevel, number>;
  monthlyCashflow: PortfolioCashflow[];
  buyerConcentration: PortfolioConcentration[];
  industryConcentration: PortfolioConcentration[];
  topRiskContracts: ContractAnalysis[];
  assumptions: string[];
}
