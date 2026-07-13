import type {
  CompanySize,
  ContractRecord,
  DataQuality,
  PaymentSchedule,
} from "../domain";
import type { CompanyFinancialImportRecord } from "./csv";
import type { ProcurementRecord } from "./types";

/**
 * KONEPS and company statements do not contain contract-specific cost curves or
 * payment terms. The caller must supply these assumptions explicitly (normally
 * from the Data Hub promotion form) so the analysis never hides invented data.
 */
export interface ContractCreationAssumptions {
  companySize: CompanySize;
  industryLabel: string;
  region: string;
  awardedAt?: string;
  contractAmountKrw?: number;
  estimatedCostRatePct: number;
  monthlyOperatingCashOutflowKrw: number;
  existingBorrowingsKrw?: number;
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
  companyDataQuality: Exclude<DataQuality, "synthetic">;
  notes?: string;
}

export class DataMergeError extends Error {
  readonly field: keyof ContractCreationAssumptions | "procurement";

  constructor(field: keyof ContractCreationAssumptions | "procurement") {
    super(`분석 계약 생성에 필요한 값이 없거나 유효하지 않습니다: ${field}`);
    this.name = "DataMergeError";
    this.field = field;
  }
}

function requireFinite(
  value: number | undefined,
  field: keyof ContractCreationAssumptions | "procurement",
  options: { min?: number; max?: number; integer?: boolean } = {},
): number {
  if (
    value === undefined ||
    !Number.isFinite(value) ||
    (options.integer && !Number.isInteger(value)) ||
    (options.min !== undefined && value < options.min) ||
    (options.max !== undefined && value > options.max)
  ) {
    throw new DataMergeError(field);
  }
  return value;
}

function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  if (!match) return null;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  return Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ? null : date;
}

function inferCompanySize(
  employeeCount: number | null,
  fallback: CompanySize,
): CompanySize {
  if (employeeCount === null) return fallback;
  if (employeeCount < 10) return "micro";
  if (employeeCount < 50) return "small";
  if (employeeCount < 300) return "medium";
  return "large";
}

export function createContractRecordFromSources(
  procurement: ProcurementRecord,
  company: CompanyFinancialImportRecord,
  assumptions: ContractCreationAssumptions,
): ContractRecord {
  const contractAmountKrw = requireFinite(
    assumptions.contractAmountKrw ?? procurement.awardAmount ?? procurement.estimatedAmount ?? undefined,
    "contractAmountKrw",
    { min: 1 },
  );
  const baseAmountKrw = requireFinite(
    procurement.baseAmount ?? procurement.estimatedAmount ?? contractAmountKrw,
    "procurement",
    { min: 1 },
  );
  const estimatedCostRatePct = requireFinite(
    assumptions.estimatedCostRatePct,
    "estimatedCostRatePct",
    { min: 0, max: 200 },
  );
  const awardedAt =
    dateOnly(assumptions.awardedAt) ??
    dateOnly(procurement.contractedAt) ??
    dateOnly(procurement.openedAt) ??
    dateOnly(procurement.publishedAt);
  if (!awardedAt) throw new DataMergeError("awardedAt");

  for (const field of ["advancePaymentRatePct", "upfrontCostRatePct", "fixedCostRatePct"] as const) {
    requireFinite(assumptions[field], field, { min: 0, max: 100 });
  }
  for (const field of ["retentionRatePct", "guaranteeDepositRatePct"] as const) {
    requireFinite(assumptions[field], field, { min: 0, max: 30 });
  }

  const bidRatePct =
    procurement.awardRate ??
    (baseAmountKrw > 0 ? Math.round((contractAmountKrw / baseAmountKrw) * 10_000) / 100 : 100);
  const procurementId = procurement.bidNoticeNo
    ? `${procurement.bidNoticeNo}${procurement.bidNoticeOrder ? `-${procurement.bidNoticeOrder}` : ""}`
    : procurement.id;
  const notes = [
    `조달 ${procurement.resource}/${procurement.kind} 데이터와 기업 재무 CSV를 결합했습니다.`,
    `계약원가율 ${estimatedCostRatePct}% 및 지급조건은 사용자 가정입니다.`,
    assumptions.notes?.trim(),
  ].filter(Boolean);

  return {
    id: `imported-${procurement.id}-${company.companyId ?? company.businessRegistrationNo ?? "company"}`
      .replace(/[^\p{L}\p{N}._-]/gu, "-")
      .slice(0, 160),
    procurementId,
    title: procurement.title,
    companyName: company.companyName,
    companySize: inferCompanySize(company.employeeCount, assumptions.companySize),
    industry: company.industryCode ?? assumptions.industryLabel,
    region: assumptions.region.trim() || "미입력",
    buyer: procurement.demandOrganization ?? procurement.organization ?? "기관명 미제공",
    awardedAt,
    contractAmountKrw,
    baseAmountKrw,
    bidRatePct,
    estimatedTotalCostKrw: Math.round(contractAmountKrw * (estimatedCostRatePct / 100)),
    availableCashKrw: requireFinite(company.cashAndEquivalents, "procurement", { min: 0 }),
    monthlyOperatingCashOutflowKrw: requireFinite(
      assumptions.monthlyOperatingCashOutflowKrw,
      "monthlyOperatingCashOutflowKrw",
      { min: 0 },
    ),
    existingBorrowingsKrw: requireFinite(
      assumptions.existingBorrowingsKrw ?? company.totalDebt,
      "existingBorrowingsKrw",
      { min: 0 },
    ),
    monthlyDebtServiceKrw: requireFinite(
      assumptions.monthlyDebtServiceKrw,
      "monthlyDebtServiceKrw",
      { min: 0 },
    ),
    annualInterestRatePct: requireFinite(
      assumptions.annualInterestRatePct,
      "annualInterestRatePct",
      { min: 0, max: 50 },
    ),
    durationMonths: requireFinite(assumptions.durationMonths, "durationMonths", {
      min: 1,
      max: 120,
      integer: true,
    }),
    paymentDelayDays: requireFinite(assumptions.paymentDelayDays, "paymentDelayDays", {
      min: 0,
      max: 730,
      integer: true,
    }),
    advancePaymentRatePct: assumptions.advancePaymentRatePct,
    retentionRatePct: assumptions.retentionRatePct,
    guaranteeDepositRatePct: assumptions.guaranteeDepositRatePct,
    upfrontCostRatePct: assumptions.upfrontCostRatePct,
    fixedCostRatePct: assumptions.fixedCostRatePct,
    paymentSchedule: assumptions.paymentSchedule,
    dataQuality: procurement.isSynthetic ? "synthetic" : assumptions.companyDataQuality,
    isSynthetic: procurement.isSynthetic,
    description: notes.join(" "),
  };
}
