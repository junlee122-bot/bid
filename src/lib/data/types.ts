export const PROCUREMENT_RESOURCES = ["notice", "award", "contract"] as const;
export const PROCUREMENT_KINDS = ["construction", "service", "goods"] as const;

export type ProcurementResource = (typeof PROCUREMENT_RESOURCES)[number];
export type ProcurementKind = (typeof PROCUREMENT_KINDS)[number];
export type ProcurementSource = "koneps-live" | "demo";

export interface ProcurementSearchQuery {
  resources?: ProcurementResource[];
  kinds?: ProcurementKind[];
  keyword?: string;
  bidNoticeNo?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  allowDemoFallback?: boolean;
}

export interface NormalizedProcurementSearchQuery {
  resources: ProcurementResource[];
  kinds: ProcurementKind[];
  keyword?: string;
  bidNoticeNo?: string;
  from: string;
  to: string;
  page: number;
  pageSize: number;
  allowDemoFallback: boolean;
}

/**
 * Common view of the three KONEPS resources used by BID-SHIELD. Nullable
 * values are intentional: fields differ by work type and older records.
 */
export interface ProcurementRecord {
  id: string;
  resource: ProcurementResource;
  kind: ProcurementKind;
  source: ProcurementSource;
  isSynthetic: boolean;
  bidNoticeNo: string | null;
  bidNoticeOrder: string | null;
  title: string;
  organization: string | null;
  demandOrganization: string | null;
  publishedAt: string | null;
  deadlineAt: string | null;
  openedAt: string | null;
  contractedAt: string | null;
  estimatedAmount: number | null;
  baseAmount: number | null;
  awardAmount: number | null;
  awardRate: number | null;
  winnerName: string | null;
  contractNumber: string | null;
  contractMethod: string | null;
  referenceUrl: string | null;
}

export interface ProcurementSearchResult {
  source: "live" | "demo" | "mixed";
  items: ProcurementRecord[];
  totalCount: number;
  fetchedAt: string;
  query: NormalizedProcurementSearchQuery;
  warnings: string[];
}

export interface ApiErrorBody {
  ok: false;
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export interface ProcurementApiSuccess {
  ok: true;
  data: ProcurementSearchResult;
}

export type ProcurementApiResponse = ProcurementApiSuccess | ApiErrorBody;
