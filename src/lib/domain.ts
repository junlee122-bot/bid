export type CompanySize = "micro" | "small" | "medium" | "large";

export type PaymentSchedule = "monthly" | "milestone" | "completion";

export type DataQuality = "verified" | "estimated" | "synthetic";

export type RiskLevel = "low" | "caution" | "high" | "critical";

export type ProcurementLifecycleStage = "opportunity" | "awarded" | "contracted";

export type BidderMatchStatus = "matched" | "mismatch" | "unknown" | "not-applicable";

export type FieldEvidenceType = "source" | "user-assumption" | "model-derived";

export interface ContractFieldProvenance {
  /** System or actor that supplied the value, never a secret or raw identifier. */
  origin: "procurement" | "company-financial-csv" | "user-input" | "model";
  evidence: FieldEvidenceType;
  detail?: string;
  asOfDate?: string | null;
}

export interface CompanyFinancialSnapshot {
  annualRevenueKrw: number;
  operatingProfitKrw: number;
  cashAndEquivalentsKrw: number;
  currentAssetsKrw: number;
  currentLiabilitiesKrw: number;
  totalDebtKrw: number;
  existingOrderBacklogKrw: number | null;
  averageCollectionDays: number | null;
  averagePaymentDays: number | null;
}

export interface ContractDataProvenance {
  company: {
    /** Stable pseudonymous key. Raw business registration numbers are never retained. */
    stableKey: string;
    source: "company-financial-csv";
    asOfDate: string | null;
    financials: CompanyFinancialSnapshot;
  };
  procurement: {
    resource: "notice" | "award" | "contract";
    kind: "construction" | "service" | "goods";
    source: "koneps-live" | "demo";
    referenceUrl: string | null;
    winnerName: string | null;
    lifecycleStage: ProcurementLifecycleStage;
    bidderMatch: BidderMatchStatus;
  };
  /** Audit trail for values copied, entered, or derived during record creation. */
  fields: Record<string, ContractFieldProvenance>;
  warnings: string[];
}

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
  /** Optional for records saved before provenance tracking was introduced. */
  provenance?: ContractDataProvenance;
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

export interface CorporateFinancialSignals {
  asOfDate: string | null;
  currentRatioPct: number | null;
  netWorkingCapitalKrw: number;
  debtToRevenuePct: number | null;
  backlogToRevenuePct: number | null;
  averageCollectionDays: number | null;
  averagePaymentDays: number | null;
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
  /** Derived only when a structured company-financial provenance snapshot exists. */
  corporateFinancialSignals: CorporateFinancialSignals | null;
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

export interface PortfolioCompanyFunding {
  companyKey: string;
  companyName: string;
  contractCount: number;
  minimumCashBalanceKrw: number;
  liquidityBufferKrw: number;
  fundingRequirementKrw: number;
}

export interface PortfolioAnalysis {
  scenario: ScenarioInputs;
  contracts: ContractAnalysis[];
  contractCount: number;
  totalContractAmountKrw: number;
  totalAdjustedRevenueKrw: number;
  totalProjectedCostKrw: number;
  totalSurvivalMarginKrw: number;
  /** Company-level requirement after reconciling shared cash and fixed outflows once. */
  totalFundingRequirementKrw: number;
  /** Sum of stand-alone contract requirements before company-level reconciliation. */
  conservativeContractFundingRequirementKrw: number;
  companyFundingRequirements: PortfolioCompanyFunding[];
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
