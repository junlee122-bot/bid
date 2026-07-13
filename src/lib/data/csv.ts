export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 5_000;
const MAX_CELL_LENGTH = 10_000;

export const COMPANY_IMPORT_FIELDS = [
  "company_id",
  "company_name",
  "business_registration_no",
  "industry_code",
  "credit_grade",
  "annual_revenue",
  "operating_profit",
  "cash_and_equivalents",
  "current_assets",
  "current_liabilities",
  "total_debt",
  "existing_order_backlog",
  "average_collection_days",
  "average_payment_days",
  "employee_count",
  "as_of_date",
] as const;

export type CompanyImportField = (typeof COMPANY_IMPORT_FIELDS)[number];

export const REQUIRED_COMPANY_IMPORT_FIELDS = [
  "company_name",
  "annual_revenue",
  "operating_profit",
  "cash_and_equivalents",
  "current_assets",
  "current_liabilities",
  "total_debt",
] as const satisfies readonly CompanyImportField[];

type IssueSeverity = "error" | "warning";

export interface CsvImportIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  /** Physical line where the record starts. The header is line 1. */
  row: number;
  field?: CompanyImportField;
  value?: string;
}

export interface CompanyFinancialImportRecord {
  companyId: string | null;
  companyName: string;
  businessRegistrationNo: string | null;
  industryCode: string | null;
  creditGrade: string | null;
  annualRevenue: number;
  operatingProfit: number;
  cashAndEquivalents: number;
  currentAssets: number;
  currentLiabilities: number;
  totalDebt: number;
  existingOrderBacklog: number | null;
  averageCollectionDays: number | null;
  averagePaymentDays: number | null;
  employeeCount: number | null;
  asOfDate: string | null;
}

export interface CompanyCsvImportResult {
  valid: boolean;
  records: CompanyFinancialImportRecord[];
  issues: CsvImportIssue[];
  headers: CompanyImportField[];
  summary: {
    totalRows: number;
    acceptedRows: number;
    rejectedRows: number;
    errorCount: number;
    warningCount: number;
  };
}

export interface ImportApiSuccess {
  ok: true;
  data: CompanyCsvImportResult;
  meta: {
    encoding: "utf-8" | "euc-kr" | "json-string";
    importedAt: string;
  };
}

export interface CompanyImportSchemaField {
  name: CompanyImportField;
  label: string;
  required: boolean;
  type: "string" | "number" | "integer" | "date";
  description: string;
}

export const COMPANY_IMPORT_SCHEMA: readonly CompanyImportSchemaField[] = [
  { name: "company_id", label: "기업 ID", required: false, type: "string", description: "KODATA 또는 내부 기업 식별자" },
  { name: "company_name", label: "기업명", required: true, type: "string", description: "법인 또는 사업체 명칭" },
  { name: "business_registration_no", label: "사업자등록번호", required: false, type: "string", description: "10자리 번호, 하이픈 허용" },
  { name: "industry_code", label: "업종 코드", required: false, type: "string", description: "KSIC 등 사용 중인 산업분류 코드" },
  { name: "credit_grade", label: "신용등급", required: false, type: "string", description: "예: BBB+, BB-" },
  { name: "annual_revenue", label: "연매출", required: true, type: "number", description: "최근 연간 매출액(원)" },
  { name: "operating_profit", label: "영업이익", required: true, type: "number", description: "최근 연간 영업이익(원), 적자 시 음수" },
  { name: "cash_and_equivalents", label: "현금및현금성자산", required: true, type: "number", description: "기준일 현재 금액(원)" },
  { name: "current_assets", label: "유동자산", required: true, type: "number", description: "기준일 현재 금액(원)" },
  { name: "current_liabilities", label: "유동부채", required: true, type: "number", description: "기준일 현재 금액(원)" },
  { name: "total_debt", label: "총부채", required: true, type: "number", description: "기준일 현재 부채총계(원)" },
  { name: "existing_order_backlog", label: "기존 수주잔고", required: false, type: "number", description: "분석 시점 미이행 수주잔고(원)" },
  { name: "average_collection_days", label: "평균 회수일", required: false, type: "number", description: "매출채권 평균 회수기간(일)" },
  { name: "average_payment_days", label: "평균 지급일", required: false, type: "number", description: "매입채무 평균 지급기간(일)" },
  { name: "employee_count", label: "종업원 수", required: false, type: "integer", description: "기준일 현재 인원" },
  { name: "as_of_date", label: "기준일", required: false, type: "date", description: "YYYY-MM-DD 또는 YYYYMMDD" },
] as const;

const HEADER_ALIASES: Record<CompanyImportField, readonly string[]> = {
  company_id: ["company_id", "companyid", "corp_id", "기업id", "기업아이디", "회사id"],
  company_name: ["company_name", "companyname", "corp_name", "기업명", "회사명", "법인명"],
  business_registration_no: [
    "business_registration_no",
    "business_no",
    "biz_no",
    "사업자등록번호",
    "사업자번호",
  ],
  industry_code: ["industry_code", "ksic", "업종코드", "산업코드", "표준산업분류코드"],
  credit_grade: ["credit_grade", "creditrating", "신용등급", "기업신용등급"],
  annual_revenue: ["annual_revenue", "revenue", "sales", "연매출", "연간매출액", "매출액"],
  operating_profit: ["operating_profit", "operatingincome", "영업이익"],
  cash_and_equivalents: [
    "cash_and_equivalents",
    "cash",
    "현금및현금성자산",
    "현금성자산",
  ],
  current_assets: ["current_assets", "유동자산"],
  current_liabilities: ["current_liabilities", "유동부채"],
  total_debt: ["total_debt", "totalliabilities", "총부채", "부채총계"],
  existing_order_backlog: [
    "existing_order_backlog",
    "order_backlog",
    "수주잔고",
    "기존수주잔고",
  ],
  average_collection_days: [
    "average_collection_days",
    "collection_days",
    "평균회수일",
    "매출채권회전일수",
  ],
  average_payment_days: [
    "average_payment_days",
    "payment_days",
    "평균지급일",
    "매입채무회전일수",
  ],
  employee_count: ["employee_count", "employees", "직원수", "종업원수"],
  as_of_date: ["as_of_date", "date", "기준일", "결산기준일"],
};

interface CsvRow {
  cells: string[];
  line: number;
}

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s._-]+/g, "");
}

const ALIAS_TO_FIELD = new Map<string, CompanyImportField>(
  COMPANY_IMPORT_FIELDS.flatMap((field) =>
    HEADER_ALIASES[field].map((alias) => [normalizeHeader(alias), field] as const),
  ),
);

function pushCell(row: string[], field: string): void {
  row.push(field.trim());
}

/** Small RFC 4180-compatible parser: quoted commas, escaped quotes and embedded newlines. */
function parseCsvRows(csv: string): { rows: CsvRow[]; issue?: CsvImportIssue } {
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let rowStartLine = 1;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (char === '"') {
      if (inQuotes && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (inQuotes) {
        inQuotes = false;
      } else if (field.length === 0) {
        inQuotes = true;
      } else {
        field += char;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      pushCell(cells, field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && csv[index + 1] === "\n") index += 1;
      pushCell(cells, field);
      if (cells.some((cell) => cell.length > 0)) rows.push({ cells, line: rowStartLine });
      cells = [];
      field = "";
      line += 1;
      rowStartLine = line;
      continue;
    }

    if (char === "\n" || char === "\r") line += 1;
    field += char;
  }

  if (inQuotes) {
    return {
      rows,
      issue: {
        severity: "error",
        code: "UNTERMINATED_QUOTE",
        message: "닫히지 않은 큰따옴표가 있습니다.",
        row: rowStartLine,
      },
    };
  }

  pushCell(cells, field);
  if (cells.some((cell) => cell.length > 0)) rows.push({ cells, line: rowStartLine });
  return { rows };
}

function issue(
  severity: IssueSeverity,
  code: string,
  message: string,
  row: number,
  field?: CompanyImportField,
  value?: string,
): CsvImportIssue {
  return {
    severity,
    code,
    message,
    row,
    ...(field ? { field } : {}),
    ...(value !== undefined ? { value: value.slice(0, 200) } : {}),
  };
}

function parseNumberField(
  value: string | undefined,
  field: CompanyImportField,
  row: number,
  issues: CsvImportIssue[],
  options: { required: boolean; min?: number; max?: number; integer?: boolean },
): number | null {
  const raw = value?.trim() ?? "";
  if (!raw) {
    if (options.required) {
      issues.push(issue("error", "REQUIRED_VALUE", "필수 값이 비어 있습니다.", row, field));
    }
    return null;
  }
  const normalized = raw.replace(/[,%₩원\s]/g, "");
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) {
    issues.push(issue("error", "INVALID_NUMBER", "숫자 형식이 아닙니다.", row, field, raw));
    return null;
  }
  const valueAsNumber = Number(normalized);
  if (!Number.isFinite(valueAsNumber)) {
    issues.push(issue("error", "INVALID_NUMBER", "유효한 숫자 범위를 벗어났습니다.", row, field, raw));
    return null;
  }
  if (options.integer && !Number.isInteger(valueAsNumber)) {
    issues.push(issue("error", "NOT_INTEGER", "정수를 입력해 주세요.", row, field, raw));
  }
  if (options.min !== undefined && valueAsNumber < options.min) {
    issues.push(issue("error", "BELOW_MINIMUM", `${options.min} 이상이어야 합니다.`, row, field, raw));
  }
  if (options.max !== undefined && valueAsNumber > options.max) {
    issues.push(issue("error", "ABOVE_MAXIMUM", `${options.max} 이하여야 합니다.`, row, field, raw));
  }
  return valueAsNumber;
}

function normalizeDate(value: string | undefined, row: number, issues: CsvImportIssue[]): string | null {
  const raw = value?.trim() ?? "";
  if (!raw) return null;
  const match = raw.replace(/[./]/g, "-").match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
  if (!match) {
    issues.push(issue("error", "INVALID_DATE", "YYYY-MM-DD 형식이어야 합니다.", row, "as_of_date", raw));
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    issues.push(issue("error", "INVALID_DATE", "존재하지 않는 날짜입니다.", row, "as_of_date", raw));
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function businessNumberChecksumIsValid(digits: string): boolean {
  if (!/^\d{10}$/.test(digits)) return false;
  const numbers = [...digits].map(Number);
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const sum = weights.reduce((total, weight, index) => total + weight * numbers[index], 0);
  const check = (10 - ((sum + Math.floor((numbers[8] * 5) / 10)) % 10)) % 10;
  return check === numbers[9];
}

function normalizeBusinessNumber(
  value: string | undefined,
  row: number,
  issues: CsvImportIssue[],
): string | null {
  const raw = value?.trim() ?? "";
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 10) {
    issues.push(
      issue("error", "INVALID_BUSINESS_NUMBER", "사업자등록번호는 10자리여야 합니다.", row, "business_registration_no", raw),
    );
    return null;
  }
  if (!businessNumberChecksumIsValid(digits)) {
    issues.push(
      issue("warning", "BUSINESS_NUMBER_CHECKSUM", "사업자등록번호 검증값을 확인해 주세요.", row, "business_registration_no", raw),
    );
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function valueFor(
  cells: string[],
  fieldIndexes: ReadonlyMap<CompanyImportField, number>,
  field: CompanyImportField,
): string | undefined {
  const index = fieldIndexes.get(field);
  return index === undefined ? undefined : cells[index];
}

function parseDataRow(
  csvRow: CsvRow,
  fieldIndexes: ReadonlyMap<CompanyImportField, number>,
  issues: CsvImportIssue[],
): CompanyFinancialImportRecord | null {
  const issueStartIndex = issues.length;
  const get = (field: CompanyImportField) => valueFor(csvRow.cells, fieldIndexes, field);
  for (const [index, cell] of csvRow.cells.entries()) {
    if (cell.length > MAX_CELL_LENGTH) {
      const field = [...fieldIndexes.entries()].find(([, fieldIndex]) => fieldIndex === index)?.[0];
      issues.push(issue("error", "CELL_TOO_LONG", `셀은 ${MAX_CELL_LENGTH}자 이하여야 합니다.`, csvRow.line, field));
    }
  }

  const companyName = get("company_name")?.trim() ?? "";
  if (!companyName) {
    issues.push(issue("error", "REQUIRED_VALUE", "기업명은 필수입니다.", csvRow.line, "company_name"));
  } else if (companyName.length > 200) {
    issues.push(issue("error", "VALUE_TOO_LONG", "기업명은 200자 이하여야 합니다.", csvRow.line, "company_name"));
  }
  if (/^[=+@]/.test(companyName) || /^-\D/.test(companyName)) {
    issues.push(issue("warning", "POSSIBLE_FORMULA", "스프레드시트 수식으로 해석될 수 있는 값입니다.", csvRow.line, "company_name", companyName));
  }

  const annualRevenue = parseNumberField(get("annual_revenue"), "annual_revenue", csvRow.line, issues, { required: true, min: 0 });
  const operatingProfit = parseNumberField(get("operating_profit"), "operating_profit", csvRow.line, issues, { required: true });
  const cashAndEquivalents = parseNumberField(get("cash_and_equivalents"), "cash_and_equivalents", csvRow.line, issues, { required: true, min: 0 });
  const currentAssets = parseNumberField(get("current_assets"), "current_assets", csvRow.line, issues, { required: true, min: 0 });
  const currentLiabilities = parseNumberField(get("current_liabilities"), "current_liabilities", csvRow.line, issues, { required: true, min: 0 });
  const totalDebt = parseNumberField(get("total_debt"), "total_debt", csvRow.line, issues, { required: true, min: 0 });
  const existingOrderBacklog = parseNumberField(get("existing_order_backlog"), "existing_order_backlog", csvRow.line, issues, { required: false, min: 0 });
  const averageCollectionDays = parseNumberField(get("average_collection_days"), "average_collection_days", csvRow.line, issues, { required: false, min: 0, max: 730 });
  const averagePaymentDays = parseNumberField(get("average_payment_days"), "average_payment_days", csvRow.line, issues, { required: false, min: 0, max: 730 });
  const employeeCount = parseNumberField(get("employee_count"), "employee_count", csvRow.line, issues, { required: false, min: 0, max: 10_000_000, integer: true });
  const businessRegistrationNo = normalizeBusinessNumber(get("business_registration_no"), csvRow.line, issues);
  const asOfDate = normalizeDate(get("as_of_date"), csvRow.line, issues);
  const creditGrade = get("credit_grade")?.trim().toUpperCase() || null;
  if (creditGrade && !/^(?:AAA|AA[+-]?|A[+-]?|BBB[+-]?|BB[+-]?|B[+-]?|CCC[+-]?|CC|C|D)$/.test(creditGrade)) {
    issues.push(issue("warning", "UNUSUAL_CREDIT_GRADE", "일반적인 기업 신용등급 형식인지 확인해 주세요.", csvRow.line, "credit_grade", creditGrade));
  }

  if (currentAssets !== null && cashAndEquivalents !== null && cashAndEquivalents > currentAssets) {
    issues.push(issue("warning", "CASH_EXCEEDS_CURRENT_ASSETS", "현금성자산이 유동자산보다 큽니다.", csvRow.line, "cash_and_equivalents"));
  }
  if (currentAssets !== null && currentLiabilities !== null && currentLiabilities > currentAssets) {
    issues.push(issue("warning", "NEGATIVE_WORKING_CAPITAL", "유동부채가 유동자산보다 큽니다.", csvRow.line, "current_liabilities"));
  }
  if (annualRevenue !== null && annualRevenue > 0 && totalDebt !== null && totalDebt > annualRevenue * 3) {
    issues.push(issue("warning", "HIGH_DEBT_TO_REVENUE", "총부채가 연매출의 3배를 초과합니다.", csvRow.line, "total_debt"));
  }

  const rowHasErrors = issues.slice(issueStartIndex).some((entry) => entry.severity === "error");
  if (
    rowHasErrors ||
    annualRevenue === null ||
    operatingProfit === null ||
    cashAndEquivalents === null ||
    currentAssets === null ||
    currentLiabilities === null ||
    totalDebt === null
  ) {
    return null;
  }

  return {
    companyId: get("company_id")?.trim() || null,
    companyName,
    businessRegistrationNo,
    industryCode: get("industry_code")?.trim() || null,
    creditGrade,
    annualRevenue,
    operatingProfit,
    cashAndEquivalents,
    currentAssets,
    currentLiabilities,
    totalDebt,
    existingOrderBacklog,
    averageCollectionDays,
    averagePaymentDays,
    employeeCount,
    asOfDate,
  };
}

function emptyResult(issues: CsvImportIssue[], headers: CompanyImportField[] = []): CompanyCsvImportResult {
  const errorCount = issues.filter((entry) => entry.severity === "error").length;
  const warningCount = issues.length - errorCount;
  return {
    valid: false,
    records: [],
    issues,
    headers,
    summary: { totalRows: 0, acceptedRows: 0, rejectedRows: 0, errorCount, warningCount },
  };
}

export function parseCompanyFinancialCsv(csv: string): CompanyCsvImportResult {
  const issues: CsvImportIssue[] = [];
  if (!csv.trim()) return emptyResult([issue("error", "EMPTY_FILE", "CSV 파일이 비어 있습니다.", 1)]);
  if (new TextEncoder().encode(csv).byteLength > IMPORT_MAX_BYTES) {
    return emptyResult([
      issue("error", "FILE_TOO_LARGE", `CSV는 ${IMPORT_MAX_BYTES / 1024 / 1024}MB 이하여야 합니다.`, 1),
    ]);
  }

  const parsed = parseCsvRows(csv);
  if (parsed.issue) issues.push(parsed.issue);
  if (parsed.rows.length === 0) return emptyResult(issues.length ? issues : [issue("error", "EMPTY_FILE", "CSV 파일이 비어 있습니다.", 1)]);
  const [headerRow, ...dataRows] = parsed.rows;
  if (dataRows.length > IMPORT_MAX_ROWS) {
    issues.push(issue("error", "TOO_MANY_ROWS", `한 번에 최대 ${IMPORT_MAX_ROWS}개 기업을 가져올 수 있습니다.`, headerRow.line));
  }

  const fieldIndexes = new Map<CompanyImportField, number>();
  headerRow.cells.forEach((header, index) => {
    const field = ALIAS_TO_FIELD.get(normalizeHeader(header));
    if (!field) {
      issues.push(issue("warning", "UNKNOWN_HEADER", "사용하지 않는 열입니다.", headerRow.line, undefined, header));
      return;
    }
    if (fieldIndexes.has(field)) {
      issues.push(issue("error", "DUPLICATE_HEADER", `중복 열: ${field}`, headerRow.line, field, header));
      return;
    }
    fieldIndexes.set(field, index);
  });
  for (const required of REQUIRED_COMPANY_IMPORT_FIELDS) {
    if (!fieldIndexes.has(required)) {
      issues.push(issue("error", "MISSING_HEADER", `필수 열이 없습니다: ${required}`, headerRow.line, required));
    }
  }

  const headers = [...fieldIndexes.keys()];
  if (issues.some((entry) => entry.severity === "error" && entry.row === headerRow.line)) {
    return emptyResult(issues, headers);
  }

  const limitedRows = dataRows.slice(0, IMPORT_MAX_ROWS);
  const records: CompanyFinancialImportRecord[] = [];
  const seenKeys = new Map<string, number>();
  let rejectedRows = 0;
  for (const row of limitedRows) {
    const record = parseDataRow(row, fieldIndexes, issues);
    if (!record) {
      rejectedRows += 1;
      continue;
    }
    const uniqueKey = record.businessRegistrationNo
      ? `${record.businessRegistrationNo}|${record.asOfDate ?? "latest"}`
      : record.companyId
        ? `${record.companyId}|${record.asOfDate ?? "latest"}`
        : "";
    if (uniqueKey && seenKeys.has(uniqueKey)) {
      issues.push(
        issue(
          "error",
          "DUPLICATE_COMPANY",
          `${seenKeys.get(uniqueKey)}행과 같은 기업·기준일 레코드입니다.`,
          row.line,
          record.businessRegistrationNo ? "business_registration_no" : "company_id",
        ),
      );
      rejectedRows += 1;
      continue;
    }
    if (uniqueKey) seenKeys.set(uniqueKey, row.line);
    records.push(record);
  }

  const errorCount = issues.filter((entry) => entry.severity === "error").length;
  const warningCount = issues.length - errorCount;
  return {
    valid: errorCount === 0,
    records,
    issues,
    headers,
    summary: {
      totalRows: limitedRows.length,
      acceptedRows: records.length,
      rejectedRows,
      errorCount,
      warningCount,
    },
  };
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function createCompanyImportTemplate(options: { includeExample?: boolean; bom?: boolean } = {}): string {
  const rows = [COMPANY_IMPORT_FIELDS.join(",")];
  if (options.includeExample ?? true) {
    const example = [
      "demo-company-001",
      "BID-SHIELD 합성기업",
      "123-45-67891",
      "J62",
      "BBB+",
      "12000000000",
      "780000000",
      "920000000",
      "4600000000",
      "3100000000",
      "5200000000",
      "6800000000",
      "74",
      "42",
      "86",
      "2026-06-30",
    ];
    rows.push(example.map(csvCell).join(","));
  }
  return `${options.bom === false ? "" : "\uFEFF"}${rows.join("\r\n")}\r\n`;
}
