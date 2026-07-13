import { getDemoProcurementRecords } from "./demo";
import {
  PROCUREMENT_KINDS,
  PROCUREMENT_RESOURCES,
  type NormalizedProcurementSearchQuery,
  type ProcurementKind,
  type ProcurementRecord,
  type ProcurementResource,
  type ProcurementSearchQuery,
  type ProcurementSearchResult,
} from "./types";

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_QUERY_RANGE_DAYS = 31;

const ENDPOINTS: Record<
  ProcurementResource,
  { baseUrl: string; operations: Record<ProcurementKind, string> }
> = {
  notice: {
    baseUrl: "https://apis.data.go.kr/1230000/ad/BidPublicInfoService",
    operations: {
      construction: "getBidPblancListInfoCnstwkPPSSrch",
      service: "getBidPblancListInfoServcPPSSrch",
      goods: "getBidPblancListInfoThngPPSSrch",
    },
  },
  award: {
    baseUrl: "https://apis.data.go.kr/1230000/as/ScsbidInfoService",
    operations: {
      construction: "getScsbidListSttusCnstwkPPSSrch",
      service: "getScsbidListSttusServcPPSSrch",
      goods: "getScsbidListSttusThngPPSSrch",
    },
  },
  contract: {
    baseUrl: "https://apis.data.go.kr/1230000/ao/CntrctInfoService",
    operations: {
      construction: "getCntrctInfoListCnstwkPPSSrch",
      service: "getCntrctInfoListServcPPSSrch",
      goods: "getCntrctInfoListThngPPSSrch",
    },
  },
};

type JsonObject = Record<string, unknown>;

export class KonepsError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status: number;

  constructor(
    code: string,
    message: string,
    options: { retryable?: boolean; status?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "KonepsError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.status = options.status ?? 502;
  }
}

export interface KonepsSearchOptions {
  /** Defaults lazily to the server-only KONEPS_SERVICE_KEY environment variable. */
  serviceKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: Date;
}

interface ScopeResult {
  resource: ProcurementResource;
  kind: ProcurementKind;
  items: ProcurementRecord[];
  totalCount: number;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDate(date: Date): string {
  // KONEPS query dates follow Korean civil time. Vercel/CI commonly run in
  // UTC, so relying on the host timezone can search the previous day near
  // midnight in Korea.
  const korea = new Date(date.getTime() + 9 * 60 * 60 * 1_000);
  return `${korea.getUTCFullYear()}-${pad(korea.getUTCMonth() + 1)}-${pad(korea.getUTCDate())}`;
}

function parseDateOnly(value: string | undefined, field: string, fallback: string): string {
  if (!value) return fallback;
  const compact = value.trim().replaceAll(".", "-").replaceAll("/", "-");
  const match = compact.match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
  if (!match) {
    throw new KonepsError("INVALID_QUERY", `${field}는 YYYY-MM-DD 형식이어야 합니다.`, {
      status: 400,
    });
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new KonepsError("INVALID_QUERY", `${field}에 유효한 날짜를 입력해 주세요.`, {
      status: 400,
    });
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

function uniqueEnumValues<T extends string>(
  values: readonly T[] | undefined,
  allowed: readonly T[],
  fallback: readonly T[],
  field: string,
): T[] {
  if (!values || values.length === 0) return [...fallback];
  const unique = [...new Set(values)];
  if (unique.some((value) => !allowed.includes(value))) {
    throw new KonepsError("INVALID_QUERY", `${field} 검색값이 올바르지 않습니다.`, { status: 400 });
  }
  return unique;
}

export function normalizeProcurementQuery(
  input: ProcurementSearchQuery = {},
  now = new Date(),
): NormalizedProcurementSearchQuery {
  const defaultTo = formatDate(now);
  const defaultFromDate = new Date(now);
  defaultFromDate.setUTCDate(defaultFromDate.getUTCDate() - 30);
  const from = parseDateOnly(input.from, "from", formatDate(defaultFromDate));
  const to = parseDateOnly(input.to, "to", defaultTo);
  const fromTime = Date.parse(`${from}T00:00:00Z`);
  const toTime = Date.parse(`${to}T00:00:00Z`);
  const rangeDays = Math.round((toTime - fromTime) / 86_400_000);
  if (rangeDays < 0) {
    throw new KonepsError("INVALID_QUERY", "from은 to보다 늦을 수 없습니다.", { status: 400 });
  }
  if (rangeDays > MAX_QUERY_RANGE_DAYS) {
    throw new KonepsError(
      "INVALID_QUERY",
      `조회 기간은 최대 ${MAX_QUERY_RANGE_DAYS}일입니다. 기간을 나누어 조회해 주세요.`,
      { status: 400 },
    );
  }

  const page = Math.trunc(input.page ?? 1);
  const pageSize = Math.trunc(input.pageSize ?? DEFAULT_PAGE_SIZE);
  if (!Number.isFinite(page) || page < 1) {
    throw new KonepsError("INVALID_QUERY", "page는 1 이상의 정수여야 합니다.", { status: 400 });
  }
  if (!Number.isFinite(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new KonepsError(
      "INVALID_QUERY",
      `pageSize는 1 이상 ${MAX_PAGE_SIZE} 이하여야 합니다.`,
      { status: 400 },
    );
  }

  const keyword = input.keyword?.trim();
  const bidNoticeNo = input.bidNoticeNo?.trim();
  if (keyword && keyword.length > 100) {
    throw new KonepsError("INVALID_QUERY", "keyword는 100자 이하여야 합니다.", { status: 400 });
  }
  if (bidNoticeNo && !/^[\p{L}\p{N}._/-]{1,50}$/u.test(bidNoticeNo)) {
    throw new KonepsError("INVALID_QUERY", "공고번호 형식이 올바르지 않습니다.", { status: 400 });
  }

  return {
    resources: uniqueEnumValues(
      input.resources,
      PROCUREMENT_RESOURCES,
      ["notice"],
      "resource",
    ),
    kinds: uniqueEnumValues(input.kinds, PROCUREMENT_KINDS, PROCUREMENT_KINDS, "kind"),
    ...(keyword ? { keyword } : {}),
    ...(bidNoticeNo ? { bidNoticeNo } : {}),
    from,
    to,
    page,
    pageSize,
    allowDemoFallback: input.allowDemoFallback ?? true,
  };
}

function toKonepsDate(value: string, endOfDay: boolean): string {
  return value.replaceAll("-", "") + (endOfDay ? "2359" : "0000");
}

/** Accepts either the decoding key or the percent-encoded key shown by data.go.kr. */
function normalizeServiceKey(serviceKey: string): string {
  const trimmed = serviceKey.trim();
  if (!trimmed.includes("%")) return trimmed;
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

export function buildKonepsRequestUrl(
  resource: ProcurementResource,
  kind: ProcurementKind,
  query: NormalizedProcurementSearchQuery,
  serviceKey: string,
): URL {
  const endpoint = ENDPOINTS[resource];
  const url = new URL(`${endpoint.baseUrl}/${endpoint.operations[kind]}`);
  const params = new URLSearchParams({
    serviceKey: normalizeServiceKey(serviceKey),
    pageNo: String(query.page),
    numOfRows: String(query.pageSize),
    inqryDiv: "1",
    inqryBgnDt: toKonepsDate(query.from, false),
    inqryEndDt: toKonepsDate(query.to, true),
    type: "json",
  });
  if (query.bidNoticeNo) params.set("bidNtceNo", query.bidNoticeNo);
  if (query.keyword) {
    params.set(resource === "contract" ? "prodNm" : "bidNtceNm", query.keyword);
  }
  url.search = params.toString();
  return url;
}

function redact(value: string, secret: string): string {
  let sanitized = value;
  for (const candidate of [secret, normalizeServiceKey(secret), encodeURIComponent(secret)]) {
    if (candidate) sanitized = sanitized.replaceAll(candidate, "[REDACTED]");
  }
  sanitized = sanitized.replace(/([?&]serviceKey=)[^&\s]+/gi, "$1[REDACTED]");
  return sanitized.slice(0, 300);
}

function extractXmlMessage(body: string): string | null {
  for (const tag of ["returnAuthMsg", "errMsg", "resultMsg", "returnReasonCode"]) {
    const match = body.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`, "i"));
    if (match?.[1]) return match[1].replace(/<[^>]+>/g, "").trim();
  }
  return null;
}

function parseGatewayBody(body: string, secret: string): JsonObject {
  const trimmed = body.trim();
  if (!trimmed) {
    throw new KonepsError("EMPTY_RESPONSE", "나라장터가 빈 응답을 반환했습니다.", {
      retryable: true,
    });
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!isObject(parsed)) throw new Error("JSON root is not an object");
    return parsed;
  } catch (error) {
    const xmlMessage = extractXmlMessage(trimmed);
    if (xmlMessage) {
      throw new KonepsError("UPSTREAM_ERROR", redact(xmlMessage, secret), {
        retryable: /tempor|limit|timeout|service/i.test(xmlMessage),
        cause: error,
      });
    }
    throw new KonepsError("INVALID_RESPONSE", "나라장터 응답 형식을 해석할 수 없습니다.", {
      retryable: true,
      cause: error,
    });
  }
}

function readObject(value: unknown): JsonObject | undefined {
  return isObject(value) ? value : undefined;
}

function readString(record: JsonObject, aliases: readonly string[]): string | null {
  for (const alias of aliases) {
    const value = record[alias];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function readNumber(record: JsonObject, aliases: readonly string[]): number | null {
  const value = readString(record, aliases);
  if (!value) return null;
  const normalized = value.replace(/[,%₩원\s]/g, "");
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function normalizeApiDate(value: string | null): string | null {
  if (!value) return null;
  const compact = value.replace(/[^0-9]/g, "");
  if (compact.length < 8) return value;
  const date = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  if (compact.length < 12) return date;
  return `${date}T${compact.slice(8, 10)}:${compact.slice(10, 12)}:00+09:00`;
}

function safeReferenceUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function stableRecordId(
  resource: ProcurementResource,
  kind: ProcurementKind,
  raw: JsonObject,
  index: number,
): string {
  const parts = [
    readString(raw, ["bidNtceNo", "untyCntrctNo", "cntrctNo", "dcsnCntrctNo"]),
    readString(raw, ["bidNtceOrd", "bidNtceSeq", "cntrctRefNo"]),
    readString(raw, ["opengDt", "cntrctCnclsDate", "bidNtceDt"]),
  ].filter(Boolean);
  return `${resource}-${kind}-${parts.join("-") || index + 1}`.replace(/[^\p{L}\p{N}._-]/gu, "-");
}

function mapRecord(
  raw: JsonObject,
  resource: ProcurementResource,
  kind: ProcurementKind,
  index: number,
): ProcurementRecord {
  const bidNoticeNo = readString(raw, ["bidNtceNo", "bidno"]);
  const estimatedAmount = readNumber(raw, [
    "presmptPrce",
    "asignBdgtAmt",
    "bdgtAmt",
    "totCntrctAmt",
    "cntrctAmt",
  ]);
  const baseAmount = readNumber(raw, ["bsisAmount", "baseAmount", "prearngPrce"]);
  const awardAmount = readNumber(raw, [
    "sucsfbidAmt",
    "thtmCntrctAmt",
    "totCntrctAmt",
    "cntrctAmt",
  ]);
  const explicitRate = readNumber(raw, ["sucsfbidRate", "sucsfbidRt", "bidRate"]);
  const computedRate =
    awardAmount !== null && estimatedAmount && estimatedAmount > 0
      ? Math.round((awardAmount / estimatedAmount) * 10_000) / 100
      : null;
  const title =
    readString(raw, ["bidNtceNm", "cntrctNm", "prodNm", "prdctClsfcNoNm", "cntrctRefNo"]) ??
    (bidNoticeNo ? `입찰공고 ${bidNoticeNo}` : "제목 미제공 조달 건");

  return {
    id: stableRecordId(resource, kind, raw, index),
    resource,
    kind,
    source: "koneps-live",
    isSynthetic: false,
    bidNoticeNo,
    bidNoticeOrder: readString(raw, ["bidNtceOrd", "bidNtceSeq"]),
    title,
    organization: readString(raw, ["ntceInsttNm", "cntrctInsttNm", "orderInsttNm"]),
    demandOrganization: readString(raw, ["dminsttNm", "dmndInsttNm", "realDmndOrgnNm"]),
    publishedAt: normalizeApiDate(readString(raw, ["bidNtceDt", "rgstDt", "bidNtceDate"])),
    deadlineAt: normalizeApiDate(readString(raw, ["bidClseDt", "bidClseDate"])),
    openedAt: normalizeApiDate(readString(raw, ["opengDt", "opengDate", "rlOpengDt"])),
    contractedAt: normalizeApiDate(
      readString(raw, ["cntrctCnclsDate", "cntrctCnclsDt", "cntrctDate"]),
    ),
    estimatedAmount,
    baseAmount,
    awardAmount,
    awardRate: explicitRate ?? computedRate,
    winnerName: readString(raw, ["bidwinnrNm", "sucsfbidCorpNm", "cntrctCorpNm", "entrpsNm"]),
    contractNumber: readString(raw, ["untyCntrctNo", "cntrctNo", "dcsnCntrctNo"]),
    contractMethod: readString(raw, ["cntrctMthdNm", "cntrctMthd", "bidMethdNm"]),
    referenceUrl: safeReferenceUrl(
      readString(raw, ["bidNtceDtlUrl", "bidNtceUrl", "cntrctDtlInfoUrl"]),
    ),
  };
}

function unwrapResponse(payload: JsonObject, secret: string): { items: JsonObject[]; totalCount: number } {
  const response = readObject(payload.response) ?? payload;
  const header = readObject(response.header) ?? readObject(payload.header);
  const resultCode = header ? readString(header, ["resultCode", "returnReasonCode"]) : null;
  const resultMessage = header ? readString(header, ["resultMsg", "returnAuthMsg", "errMsg"]) : null;
  if (resultCode && !["0", "00", "000", "NORMAL_CODE"].includes(resultCode)) {
    const message = resultMessage ? redact(resultMessage, secret) : "나라장터 조회가 거절되었습니다.";
    throw new KonepsError(`KONEPS_${resultCode}`, message, {
      retryable: ["01", "02", "04", "05", "12", "20", "22"].includes(resultCode),
    });
  }

  const body = readObject(response.body) ?? readObject(payload.body) ?? {};
  const rawItems = body.items;
  let items: unknown[] = [];
  if (Array.isArray(rawItems)) items = rawItems;
  else if (isObject(rawItems) && Array.isArray(rawItems.item)) items = rawItems.item;
  else if (isObject(rawItems) && isObject(rawItems.item)) items = [rawItems.item];
  else if (Array.isArray(body.item)) items = body.item;
  else if (isObject(body.item)) items = [body.item];

  const total = readNumber(body, ["totalCount"]);
  return {
    items: items.filter(isObject),
    totalCount: total === null ? items.length : Math.max(0, Math.trunc(total)),
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError" || error.name === "TimeoutError"
    : error instanceof Error && /abort|timeout/i.test(error.name);
}

async function fetchScope(
  resource: ProcurementResource,
  kind: ProcurementKind,
  query: NormalizedProcurementSearchQuery,
  options: Required<Pick<KonepsSearchOptions, "fetchImpl" | "timeoutMs">> & { serviceKey: string },
): Promise<ScopeResult> {
  const url = buildKonepsRequestUrl(resource, kind, query, options.serviceKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  let response: Response;
  try {
    response = await options.fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (isAbortError(error) || controller.signal.aborted) {
      throw new KonepsError("TIMEOUT", "나라장터 응답 시간이 초과되었습니다.", {
        retryable: true,
        cause: error,
      });
    }
    throw new KonepsError("NETWORK_ERROR", "나라장터에 연결할 수 없습니다.", {
      retryable: true,
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
  }

  const responseText = await response.text();
  if (!response.ok) {
    throw new KonepsError(
      `UPSTREAM_HTTP_${response.status}`,
      `나라장터가 HTTP ${response.status} 오류를 반환했습니다.`,
      { retryable: response.status === 429 || response.status >= 500 },
    );
  }

  const payload = parseGatewayBody(responseText, options.serviceKey);
  const unwrapped = unwrapResponse(payload, options.serviceKey);
  let items = unwrapped.items.map((item, index) => mapRecord(item, resource, kind, index));
  const keyword = query.keyword?.toLocaleLowerCase("ko-KR");
  if (keyword) {
    items = items.filter((item) =>
      [item.title, item.organization, item.demandOrganization, item.winnerName].some((value) =>
        value?.toLocaleLowerCase("ko-KR").includes(keyword),
      ),
    );
  }
  return { resource, kind, items, totalCount: unwrapped.totalCount };
}

function asKonepsError(error: unknown): KonepsError {
  if (error instanceof KonepsError) return error;
  return new KonepsError("UNKNOWN_ERROR", "조달 데이터를 불러오는 중 오류가 발생했습니다.", {
    retryable: true,
    cause: error,
  });
}

function demoResult(
  query: NormalizedProcurementSearchQuery,
  warning: string,
): ProcurementSearchResult {
  const items = getDemoProcurementRecords(query);
  return {
    source: "demo",
    items,
    totalCount: items.length,
    fetchedAt: new Date().toISOString(),
    query,
    warnings: [warning, "모든 데모 레코드는 합성 데이터이며 실제 기업·계약이 아닙니다."],
  };
}

export async function searchKonepsProcurement(
  input: ProcurementSearchQuery = {},
  options: KonepsSearchOptions = {},
): Promise<ProcurementSearchResult> {
  const query = normalizeProcurementQuery(input, options.now);
  const serviceKey = options.serviceKey ?? process.env.KONEPS_SERVICE_KEY ?? "";
  if (!serviceKey.trim()) {
    if (!query.allowDemoFallback) {
      throw new KonepsError(
        "MISSING_SERVICE_KEY",
        "나라장터 연동 키가 설정되지 않았습니다. 서버 환경변수를 확인해 주세요.",
        { status: 503 },
      );
    }
    return demoResult(query, "KONEPS_SERVICE_KEY가 없어 데모 데이터로 전환했습니다.");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const environmentTimeout = Number(process.env.KONEPS_API_TIMEOUT_MS);
  const requestedTimeout = options.timeoutMs ?? environmentTimeout;
  const configuredTimeout = Number.isFinite(requestedTimeout) && requestedTimeout > 0
    ? requestedTimeout
    : DEFAULT_TIMEOUT_MS;
  const timeoutMs = Math.min(Math.max(configuredTimeout, 500), 30_000);
  const scopes = query.resources.flatMap((resource) =>
    query.kinds.map((kind) => ({ resource, kind })),
  );
  const settled = await Promise.allSettled(
    scopes.map(({ resource, kind }) =>
      fetchScope(resource, kind, query, { serviceKey, fetchImpl, timeoutMs }),
    ),
  );

  const items: ProcurementRecord[] = [];
  const warnings: string[] = [];
  let liveTotalCount = 0;
  let failedCount = 0;
  let firstError: KonepsError | undefined;
  settled.forEach((entry, index) => {
    const scope = scopes[index];
    if (entry.status === "fulfilled") {
      items.push(...entry.value.items);
      liveTotalCount += entry.value.totalCount;
      return;
    }

    failedCount += 1;
    const error = asKonepsError(entry.reason);
    firstError ??= error;
    if (query.allowDemoFallback) {
      const fallbackItems = getDemoProcurementRecords(query, scope);
      items.push(...fallbackItems);
      warnings.push(
        `${scope.resource}/${scope.kind} 실시간 조회 실패(${error.code})로 합성 데모 ${fallbackItems.length}건을 사용했습니다.`,
      );
    }
  });

  if (failedCount > 0 && !query.allowDemoFallback) throw firstError;
  if (failedCount === scopes.length) {
    warnings.push("실시간 조회가 모두 실패했습니다. 표시된 레코드는 합성 데이터입니다.");
  }
  if (failedCount > 0) {
    warnings.push("데모 레코드는 실제 기업·계약이 아니며 의사결정 근거로 사용할 수 없습니다.");
  }

  return {
    source: failedCount === 0 ? "live" : failedCount === scopes.length ? "demo" : "mixed",
    items,
    totalCount: liveTotalCount + items.filter((item) => item.source === "demo").length,
    fetchedAt: new Date().toISOString(),
    query,
    warnings,
  };
}
