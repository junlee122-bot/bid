import type { ContractDataProvenance, ContractRecord } from "../domain";

export type WorkspaceDataQualityIssueSeverity = "warning" | "error";

export interface WorkspaceDataQualityIssue {
  severity: WorkspaceDataQualityIssueSeverity;
  code: string;
  message: string;
  contractId?: string;
  field?: string;
}

export interface ContractDataQualityAssessment {
  contractId: string;
  completeness: number;
  freshness: number;
  sourceCount: number;
  financialAgeDays: number | null;
}

export interface WorkspaceDataQualityAssessment {
  /** Percentage of expected provenance fields present across the workspace. */
  completeness: number;
  /** Financial-statement recency score relative to the supplied assessment date. */
  freshness: number;
  /** Number of distinct source systems represented, including labelled demo data. */
  sourceCount: number;
  issues: WorkspaceDataQualityIssue[];
  contractCount: number;
  syntheticCount: number;
  asOfDate: string;
  contractAssessments: ContractDataQualityAssessment[];
}

interface ParsedDate {
  value: number;
  dateOnly: string;
}

function parseDate(value: string | Date): ParsedDate | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const dateOnly = value.toISOString().slice(0, 10);
    return { value: Date.parse(`${dateOnly}T00:00:00Z`), dateOnly };
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  const dateOnly = `${match[1]}-${match[2]}-${match[3]}`;
  return { value: date.getTime(), dateOnly };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPresent(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return value !== null && value !== undefined;
}

function financialMissingFields(provenance: ContractDataProvenance): string[] {
  const financials = provenance.company.financials;
  return [
    ["annualRevenueKrw", financials.annualRevenueKrw],
    ["operatingProfitKrw", financials.operatingProfitKrw],
    ["cashAndEquivalentsKrw", financials.cashAndEquivalentsKrw],
    ["currentAssetsKrw", financials.currentAssetsKrw],
    ["currentLiabilitiesKrw", financials.currentLiabilitiesKrw],
    ["totalDebtKrw", financials.totalDebtKrw],
    ["existingOrderBacklogKrw", financials.existingOrderBacklogKrw],
    ["averageCollectionDays", financials.averageCollectionDays],
    ["averagePaymentDays", financials.averagePaymentDays],
  ].flatMap(([field, value]) => (isFiniteNumber(value) ? [] : [String(field)]));
}

function completenessChecks(provenance: ContractDataProvenance): boolean[] {
  const financials = provenance.company.financials;
  const procurement = provenance.procurement;
  const fields = provenance.fields;
  const checks = [
    isPresent(provenance.company.stableKey),
    isPresent(provenance.company.source),
    isPresent(provenance.company.asOfDate),
    isFiniteNumber(financials.annualRevenueKrw),
    isFiniteNumber(financials.operatingProfitKrw),
    isFiniteNumber(financials.cashAndEquivalentsKrw),
    isFiniteNumber(financials.currentAssetsKrw),
    isFiniteNumber(financials.currentLiabilitiesKrw),
    isFiniteNumber(financials.totalDebtKrw),
    isFiniteNumber(financials.existingOrderBacklogKrw),
    isFiniteNumber(financials.averageCollectionDays),
    isFiniteNumber(financials.averagePaymentDays),
    isPresent(procurement.resource),
    isPresent(procurement.kind),
    isPresent(procurement.source),
    isPresent(procurement.lifecycleStage),
    isPresent(procurement.referenceUrl),
    isPresent(procurement.bidderMatch),
    isPresent(fields.contractAmountKrw),
    isPresent(fields.estimatedCostRatePct),
    isPresent(fields.estimatedTotalCostKrw),
    isPresent(fields.availableCashKrw),
    isPresent(fields.currentAssetsKrw),
    isPresent(fields.currentLiabilitiesKrw),
    isPresent(fields.paymentDelayDays),
  ];
  if (procurement.lifecycleStage !== "opportunity") {
    checks.push(isPresent(procurement.winnerName), procurement.bidderMatch !== "unknown");
  }
  return checks;
}

function roundScore(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)));
}

/**
 * Scores one workspace without reading clocks, storage, or the network. The
 * caller supplies `asOfDate`, making identical inputs produce identical output.
 */
export function assessWorkspaceDataQuality(
  contracts: readonly ContractRecord[],
  asOfDate: string | Date,
): WorkspaceDataQualityAssessment {
  const assessmentDate = parseDate(asOfDate);
  if (!assessmentDate) throw new RangeError("asOfDate must be a valid ISO date or Date");

  const issues: WorkspaceDataQualityIssue[] = [];
  const workspaceSources = new Set<string>();
  const contractAssessments: ContractDataQualityAssessment[] = [];

  if (contracts.length === 0) {
    issues.push({
      severity: "warning",
      code: "NO_CONTRACTS",
      message: "품질을 평가할 계약 데이터가 없습니다.",
    });
  }

  for (const contract of contracts) {
    const provenance = contract.provenance;
    if (!provenance) {
      issues.push({
        severity: "error",
        code: "MISSING_PROVENANCE",
        message: "원천 및 추정 근거가 없는 이전 형식의 계약입니다.",
        contractId: contract.id,
      });
      contractAssessments.push({
        contractId: contract.id,
        completeness: 0,
        freshness: 0,
        sourceCount: 0,
        financialAgeDays: null,
      });
      continue;
    }

    workspaceSources.add(provenance.company.source);
    workspaceSources.add(provenance.procurement.source);
    const contractSources = new Set([provenance.company.source, provenance.procurement.source]);
    const checks = completenessChecks(provenance);
    let completeness = (checks.filter(Boolean).length / checks.length) * 100;
    let freshness = 0;
    let financialAgeDays: number | null = null;
    const financialDate = provenance.company.asOfDate
      ? parseDate(provenance.company.asOfDate)
      : null;

    if (!financialDate) {
      issues.push({
        severity: "error",
        code: "MISSING_FINANCIAL_AS_OF_DATE",
        message: "기업 재무 기준일이 없어 최신성 점수를 0점으로 처리했습니다.",
        contractId: contract.id,
        field: "provenance.company.asOfDate",
      });
    } else {
      financialAgeDays = Math.floor((assessmentDate.value - financialDate.value) / 86_400_000);
      if (financialAgeDays < 0) {
        issues.push({
          severity: "warning",
          code: "FUTURE_FINANCIAL_AS_OF_DATE",
          message: "기업 재무 기준일이 품질 평가 기준일보다 미래입니다.",
          contractId: contract.id,
          field: "provenance.company.asOfDate",
        });
        financialAgeDays = 0;
      }
      freshness = roundScore(100 - (financialAgeDays / 365) * 100);
      if (financialAgeDays > 365) {
        issues.push({
          severity: "warning",
          code: "STALE_FINANCIALS",
          message: `기업 재무정보가 ${financialAgeDays}일 경과했습니다.`,
          contractId: contract.id,
          field: "provenance.company.asOfDate",
        });
      }
    }

    const missingFinancials = financialMissingFields(provenance);
    if (missingFinancials.length > 0) {
      issues.push({
        severity: "warning",
        code: "INCOMPLETE_FINANCIAL_SNAPSHOT",
        message: `재무 스냅샷 누락: ${missingFinancials.join(", ")}`,
        contractId: contract.id,
      });
    }
    if (!provenance.procurement.referenceUrl) {
      issues.push({
        severity: "warning",
        code: "MISSING_PROCUREMENT_REFERENCE",
        message: "조달 원문 참조 URL이 없어 원문 대조가 제한됩니다.",
        contractId: contract.id,
        field: "provenance.procurement.referenceUrl",
      });
    }
    if (provenance.procurement.bidderMatch === "mismatch") {
      issues.push({
        severity: "error",
        code: "BIDDER_MISMATCH",
        message: "KONEPS 낙찰자와 분석 대상 기업이 일치하지 않습니다.",
        contractId: contract.id,
        field: "provenance.procurement.bidderMatch",
      });
    }
    if (provenance.procurement.bidderMatch === "unknown") {
      issues.push({
        severity: "warning",
        code: "BIDDER_MATCH_UNKNOWN",
        message: "낙찰자와 분석 대상 기업의 일치 여부를 확인할 수 없습니다.",
        contractId: contract.id,
        field: "provenance.procurement.bidderMatch",
      });
    }
    if (contract.isSynthetic || provenance.procurement.source === "demo") {
      completeness = Math.min(completeness, 35);
      freshness = Math.min(freshness, 20);
      issues.push({
        severity: "warning",
        code: "SYNTHETIC_DATA",
        message: "합성 데모 데이터이므로 품질 점수를 보수적으로 제한했습니다.",
        contractId: contract.id,
      });
    }

    contractAssessments.push({
      contractId: contract.id,
      completeness: roundScore(completeness),
      freshness: roundScore(freshness),
      sourceCount: contractSources.size,
      financialAgeDays,
    });
  }

  const average = (field: "completeness" | "freshness") =>
    contractAssessments.length === 0
      ? 0
      : roundScore(
          contractAssessments.reduce((sum, assessment) => sum + assessment[field], 0) /
            contractAssessments.length,
        );

  return {
    completeness: average("completeness"),
    freshness: average("freshness"),
    sourceCount: workspaceSources.size,
    issues,
    contractCount: contracts.length,
    syntheticCount: contracts.filter((contract) => contract.isSynthetic).length,
    asOfDate: assessmentDate.dateOnly,
    contractAssessments,
  };
}
