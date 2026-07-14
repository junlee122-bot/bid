import type {
  BidderMatchStatus,
  CompanySize,
  ContractDataProvenance,
  ContractFieldProvenance,
  ContractRecord,
  DataQuality,
  PaymentSchedule,
  ProcurementLifecycleStage,
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

/**
 * Names from KONEPS and company statements frequently differ only by a legal
 * entity marker or whitespace. Keep the comparison deliberately conservative:
 * punctuation and common Korean legal forms are removed, but trading names are
 * otherwise left intact.
 */
function normalizeCompanyNameForMatch(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/\s+/gu, "")
    .replace(/(?:주식회사|유한회사|유한책임회사|합자회사|합명회사|사단법인|재단법인|\(주\))/gu, "")
    .replace(/[()[\]{}.,·'"`~!@#$%^&*+=:;<>?\\/|_-]+/gu, "");
}

/** FNV-1a is used only to pseudonymise a local join key, not for security. */
function stableNonCryptographicHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createStableCompanyKey(company: CompanyFinancialImportRecord): string {
  const businessNumber = company.businessRegistrationNo?.replace(/\D/g, "");
  const sourceKey = businessNumber
    ? `business:${businessNumber}`
    : company.companyId?.trim()
      ? `company-id:${company.companyId.trim().toLocaleLowerCase("ko-KR")}`
      : `name:${normalizeCompanyNameForMatch(company.companyName)}`;
  return `company_${stableNonCryptographicHash(sourceKey)}`;
}

function lifecycleStage(resource: ProcurementRecord["resource"]): ProcurementLifecycleStage {
  if (resource === "notice") return "opportunity";
  if (resource === "award") return "awarded";
  return "contracted";
}

function bidderMatchStatus(
  procurement: ProcurementRecord,
  companyName: string,
): BidderMatchStatus {
  if (procurement.resource === "notice") return "not-applicable";
  if (!procurement.winnerName?.trim()) return "unknown";
  const companyKey = normalizeCompanyNameForMatch(companyName);
  const winnerKey = normalizeCompanyNameForMatch(procurement.winnerName);
  if (!companyKey || !winnerKey) return "unknown";
  return companyKey === winnerKey ? "matched" : "mismatch";
}

function sourceField(
  origin: ContractFieldProvenance["origin"],
  detail: string,
  asOfDate?: string | null,
): ContractFieldProvenance {
  return {
    origin,
    evidence: "source",
    detail,
    ...(asOfDate !== undefined ? { asOfDate } : {}),
  };
}

function assumptionField(detail: string): ContractFieldProvenance {
  return { origin: "user-input", evidence: "user-assumption", detail };
}

function modelField(detail: string): ContractFieldProvenance {
  return { origin: "model", evidence: "model-derived", detail };
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
  const stableCompanyKey = createStableCompanyKey(company);
  const stage = lifecycleStage(procurement.resource);
  const bidderMatch = bidderMatchStatus(procurement, company.companyName);
  const operatingMarginPct = company.annualRevenue > 0
    ? Math.round((company.operatingProfit / company.annualRevenue) * 10_000) / 100
    : null;
  const costAssumptionDetail = operatingMarginPct === null
    ? `사용자가 확인한 계약 원가율 ${estimatedCostRatePct}%입니다. 회사 매출이 0이어서 영업이익률 기반 초기 추정은 적용할 수 없으며 계약별 실제 원가가 아닙니다.`
    : `사용자가 확인한 계약 원가율 ${estimatedCostRatePct}%입니다. 초기값은 회사 영업이익률 ${operatingMarginPct}%를 계약 마진의 대용치로 보는 모델 휴리스틱(100%-영업이익률)에서 제안될 수 있으나 계약별 실제 원가가 아닙니다.`;
  const provenanceWarnings: string[] = [];
  if (bidderMatch === "mismatch") {
    provenanceWarnings.push(
      `낙찰자 '${procurement.winnerName}'와 분석 기업 '${company.companyName}'이 일치하지 않습니다. 기업 연결을 확인하세요.`,
    );
  } else if (bidderMatch === "unknown") {
    provenanceWarnings.push("낙찰자 정보가 없어 분석 기업과의 일치 여부를 확인하지 못했습니다.");
  }
  if (procurement.resource === "notice") {
    provenanceWarnings.push("공고 단계(opportunity) 자료이며 실제 낙찰 또는 계약 체결을 의미하지 않습니다.");
  }
  if (!company.asOfDate) {
    provenanceWarnings.push("기업 재무 기준일이 없어 최신성을 평가할 수 없습니다.");
  }
  if (company.existingOrderBacklog === null) {
    provenanceWarnings.push("기존 수주잔고가 없어 포트폴리오 실행부담 진단이 제한됩니다.");
  }
  if (company.averageCollectionDays === null) {
    provenanceWarnings.push("평균 회수일이 없어 지급지연 가정과의 교차검증이 제한됩니다.");
  }
  if (procurement.isSynthetic) {
    provenanceWarnings.push("조달 자료가 합성 데모 데이터이므로 실무 판단에 사용할 수 없습니다.");
  }
  provenanceWarnings.push(costAssumptionDetail);

  const contractAmountField = assumptions.contractAmountKrw !== undefined
    ? assumptionField("사용자가 입력한 계약금액입니다.")
    : procurement.awardAmount !== null
      ? sourceField("procurement", "KONEPS 낙찰금액입니다.")
      : sourceField("procurement", "KONEPS 추정금액입니다. 실제 계약금액과 다를 수 있습니다.");
  const provenance: ContractDataProvenance = {
    company: {
      stableKey: stableCompanyKey,
      source: "company-financial-csv",
      asOfDate: company.asOfDate,
      financials: {
        annualRevenueKrw: company.annualRevenue,
        operatingProfitKrw: company.operatingProfit,
        cashAndEquivalentsKrw: company.cashAndEquivalents,
        currentAssetsKrw: company.currentAssets,
        currentLiabilitiesKrw: company.currentLiabilities,
        totalDebtKrw: company.totalDebt,
        existingOrderBacklogKrw: company.existingOrderBacklog,
        averageCollectionDays: company.averageCollectionDays,
        averagePaymentDays: company.averagePaymentDays,
      },
    },
    procurement: {
      resource: procurement.resource,
      kind: procurement.kind,
      source: procurement.source,
      referenceUrl: procurement.referenceUrl,
      winnerName: procurement.winnerName,
      lifecycleStage: stage,
      bidderMatch,
    },
    fields: {
      companyName: sourceField("company-financial-csv", "기업 재무 CSV의 기업명입니다.", company.asOfDate),
      companySize: company.employeeCount === null
        ? assumptionField("종업원 수가 없어 사용자가 선택한 기업규모입니다.")
        : modelField("기업 재무 CSV의 종업원 수 구간으로 추론했습니다."),
      industry: company.industryCode
        ? sourceField("company-financial-csv", "기업 재무 CSV의 업종코드입니다.", company.asOfDate)
        : assumptionField("업종코드가 없어 사용자가 입력한 업종입니다."),
      region: assumptionField("사용자가 입력한 사업 지역입니다."),
      buyer: sourceField("procurement", "KONEPS 수요기관 또는 공고기관입니다."),
      awardedAt: assumptions.awardedAt
        ? assumptionField("사용자가 입력한 분석 기준 계약일입니다.")
        : sourceField("procurement", "KONEPS 계약일, 개찰일 또는 공고일 중 사용 가능한 날짜입니다."),
      contractAmountKrw: contractAmountField,
      baseAmountKrw: sourceField("procurement", "KONEPS 기초금액 또는 추정금액입니다."),
      bidRatePct: procurement.awardRate !== null
        ? sourceField("procurement", "KONEPS 낙찰률입니다.")
        : modelField("계약금액을 기초금액으로 나누어 계산했습니다."),
      estimatedCostRatePct: assumptionField(costAssumptionDetail),
      estimatedTotalCostKrw: modelField("계약금액에 사용자가 확인한 계약 원가율을 곱해 계산했습니다."),
      availableCashKrw: sourceField("company-financial-csv", "기업 재무 CSV의 현금및현금성자산입니다.", company.asOfDate),
      currentAssetsKrw: sourceField("company-financial-csv", "기업 재무 CSV의 유동자산입니다.", company.asOfDate),
      currentLiabilitiesKrw: sourceField("company-financial-csv", "기업 재무 CSV의 유동부채입니다.", company.asOfDate),
      existingOrderBacklogKrw: sourceField("company-financial-csv", "기업 재무 CSV의 기존 수주잔고입니다.", company.asOfDate),
      averageCollectionDays: sourceField("company-financial-csv", "기업 재무 CSV의 평균 회수일입니다.", company.asOfDate),
      monthlyOperatingCashOutflowKrw: assumptionField("사용자가 입력한 월 고정 현금유출입니다."),
      existingBorrowingsKrw: assumptions.existingBorrowingsKrw !== undefined
        ? assumptionField("사용자가 입력한 기존 차입금입니다.")
        : sourceField("company-financial-csv", "기업 재무 CSV의 총부채를 기존 차입금 대용치로 사용했습니다.", company.asOfDate),
      monthlyDebtServiceKrw: assumptionField("사용자가 입력한 월 원리금 상환액입니다."),
      annualInterestRatePct: assumptionField("사용자가 입력한 연 이자율입니다."),
      durationMonths: assumptionField("사용자가 입력한 계약 수행기간입니다."),
      paymentDelayDays: assumptionField("사용자가 입력한 대금 지급지연 가정입니다."),
      advancePaymentRatePct: assumptionField("사용자가 입력한 선금 비율입니다."),
      retentionRatePct: assumptionField("사용자가 입력한 유보금 비율입니다."),
      guaranteeDepositRatePct: assumptionField("사용자가 입력한 계약보증금 비율입니다."),
      upfrontCostRatePct: assumptionField("사용자가 입력한 초기 원가 비율입니다."),
      fixedCostRatePct: assumptionField("사용자가 입력한 고정 원가 비율입니다."),
      paymentSchedule: assumptionField("사용자가 선택한 대금 지급방식입니다."),
    },
    warnings: provenanceWarnings,
  };
  const notes = [
    `조달 ${procurement.resource}/${procurement.kind} 데이터와 기업 재무 CSV를 결합했습니다.`,
    `계약원가율 ${estimatedCostRatePct}% 및 지급조건은 사용자/모델 가정입니다.`,
    assumptions.notes?.trim(),
  ].filter(Boolean);

  return {
    id: `imported-${procurement.id}-${stableCompanyKey}`
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
    provenance,
  };
}
