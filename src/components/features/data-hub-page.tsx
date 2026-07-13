"use client";

import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { useWorkspace } from "@/components/providers/workspace-provider";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataQualityIndicator } from "@/components/ui/data-quality";
import { Icon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createContractRecordFromSources,
  type ApiErrorBody,
  type CompanyCsvImportResult,
  type CompanyFinancialImportRecord,
  type ContractCreationAssumptions,
  type ImportApiSuccess,
  type ProcurementApiResponse,
  type ProcurementKind,
  type ProcurementRecord,
  type ProcurementResource,
  type ProcurementSearchResult,
} from "@/lib/data";
import { downloadTextFile, formatCompactKrw, formatDate, formatPct } from "@/lib/format";

const MAX_CSV_BYTES = 5 * 1024 * 1024;

const sourceMeta = {
  demo: { label: "데모", variant: "warning" as const, description: "합성 데이터로 기능을 체험 중입니다." },
  csv: { label: "CSV", variant: "primary" as const, description: "업로드한 기업 데이터가 적용되었습니다." },
  api: { label: "조달 API", variant: "success" as const, description: "공공조달 검색 결과가 적용되었습니다." },
  mixed: { label: "혼합", variant: "primary" as const, description: "여러 출처의 계약을 함께 분석 중입니다." },
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function compactWon(value: number): string {
  return `${formatCompactKrw(value)}원`;
}

function dateForContract(record: ProcurementRecord): string {
  const value = record.contractedAt ?? record.openedAt ?? record.publishedAt;
  const match = value?.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : new Date().toISOString().slice(0, 10);
}

function interestRateFromGrade(grade: string | null): number {
  if (!grade) return 7.5;
  if (/^A{2,3}/.test(grade)) return 5.2;
  if (/^A/.test(grade)) return 5.8;
  if (/^BBB/.test(grade)) return 6.6;
  if (/^BB/.test(grade)) return 7.6;
  return 9.2;
}

/**
 * Public procurement data has no project cost curve or payment terms. These
 * deliberately conservative defaults are visible in the UI and can be refined
 * later on the contract/scenario screens.
 */
function conservativeAssumptions(
  procurement: ProcurementRecord,
  company: CompanyFinancialImportRecord,
): ContractCreationAssumptions {
  const revenue = Math.max(company.annualRevenue, 1);
  const operatingMarginPct = (company.operatingProfit / revenue) * 100;
  const estimatedCostRatePct = clamp(100 - operatingMarginPct, 72, 98);
  const durationMonths = procurement.kind === "construction" ? 14 : procurement.kind === "service" ? 12 : 8;
  const paymentDelayDays = Math.round(clamp(company.averageCollectionDays ?? 60, 15, 180));
  const fixedCostRatePct = procurement.kind === "service" ? 60 : procurement.kind === "construction" ? 35 : 25;
  const upfrontCostRatePct = procurement.kind === "construction" ? 45 : procurement.kind === "goods" ? 40 : 25;

  return {
    companySize: "small",
    industryLabel: company.industryCode ?? "업종 미분류",
    region: "지역 미입력",
    awardedAt: dateForContract(procurement),
    estimatedCostRatePct,
    monthlyOperatingCashOutflowKrw: Math.round(Math.max(revenue * 0.045 / 12, 1_000_000)),
    existingBorrowingsKrw: company.totalDebt,
    monthlyDebtServiceKrw: Math.round(company.totalDebt * 0.18 / 12),
    annualInterestRatePct: interestRateFromGrade(company.creditGrade),
    durationMonths,
    paymentDelayDays,
    advancePaymentRatePct: 10,
    retentionRatePct: procurement.kind === "construction" ? 5 : 3,
    guaranteeDepositRatePct: procurement.kind === "construction" ? 10 : 5,
    upfrontCostRatePct,
    fixedCostRatePct,
    paymentSchedule: procurement.kind === "construction" ? "milestone" : "monthly",
    companyDataQuality: "estimated",
    notes: "데이터 허브의 보수적 기본 가정으로 생성되었습니다. 계약 조건 확인 후 반드시 보정해야 합니다.",
  };
}

function amountOf(record: ProcurementRecord): number | null {
  return record.awardAmount ?? record.estimatedAmount ?? record.baseAmount;
}

function hasUsableAmount(record: ProcurementRecord): boolean {
  const amount = amountOf(record);
  return amount !== null && Number.isFinite(amount) && amount > 0;
}

function companyKey(company: CompanyFinancialImportRecord, index: number): string {
  return company.companyId ?? company.businessRegistrationNo ?? `${company.companyName}-${index}`;
}

function procurementLabel(record: ProcurementRecord): string {
  const resources: Record<ProcurementResource, string> = {
    notice: "공고",
    award: "낙찰",
    contract: "계약",
  };
  const kinds: Record<ProcurementKind, string> = {
    construction: "공사",
    service: "용역",
    goods: "물품",
  };
  return `${resources[record.resource]} · ${kinds[record.kind]}`;
}

function readApiError(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as ApiErrorBody).error;
    if (error && typeof error.message === "string") return error.message;
  }
  return fallback;
}

function WorkspaceSummary() {
  const { contracts, source, updatedAt, hydrated, resetDemo } = useWorkspace();
  const config = sourceMeta[source];
  const syntheticCount = contracts.filter((record) => record.isSynthetic).length;
  const verifiedCount = contracts.filter((record) => record.dataQuality === "verified").length;
  const totalAmount = contracts.reduce((sum, record) => sum + record.contractAmountKrw, 0);
  const qualityScore = contracts.length === 0
    ? 0
    : Math.round(((verifiedCount * 100) + ((contracts.length - verifiedCount - syntheticCount) * 70) + (syntheticCount * 35)) / contracts.length);

  function exportWorkspace() {
    const date = new Date().toISOString().slice(0, 10);
    downloadTextFile(
      `bid-shield-workspace-${date}.json`,
      JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), source, contracts }, null, 2),
      "application/json;charset=utf-8",
    );
  }

  function resetWorkspace() {
    if (window.confirm("현재 워크스페이스를 지우고 합성 데모 데이터로 되돌릴까요?")) resetDemo();
  }

  return (
    <Card elevated>
      <CardHeader className="gap-4 border-b border-border md:flex-row md:items-center md:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <CardTitle>분석 워크스페이스</CardTitle>
            <Badge variant={config.variant} dot>{config.label}</Badge>
            {!hydrated && <Badge variant="neutral">로컬 데이터 확인 중</Badge>}
          </div>
          <CardDescription>{config.description} 브라우저에만 저장되며 서버 DB로 전송되지 않습니다.</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            leadingIcon={<Icon name="download" size={15} />}
            onClick={exportWorkspace}
            disabled={!hydrated}
          >
            JSON 내보내기
          </Button>
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={<Icon name="refresh" size={15} />}
            onClick={resetWorkspace}
            disabled={!hydrated}
          >
            데모로 초기화
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 pt-5 lg:grid-cols-[1fr_320px]">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <dt className="text-xs text-muted-foreground">계약</dt>
            <dd className="mt-2 font-mono text-xl font-semibold tabular-nums text-foreground">{contracts.length.toLocaleString("ko-KR")}건</dd>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <dt className="text-xs text-muted-foreground">계약 총액</dt>
            <dd className="mt-2 font-mono text-xl font-semibold tabular-nums text-foreground">{compactWon(totalAmount)}</dd>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <dt className="text-xs text-muted-foreground">검증 데이터</dt>
            <dd className="mt-2 font-mono text-xl font-semibold tabular-nums text-foreground">{verifiedCount}건</dd>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <dt className="text-xs text-muted-foreground">마지막 변경</dt>
            <dd className="mt-2 text-sm font-semibold text-foreground">{formatDate(updatedAt)}</dd>
          </div>
        </dl>
        <DataQualityIndicator
          score={qualityScore}
          completeness={contracts.length ? 100 : 0}
          freshness={source === "demo" ? 45 : 75}
          sourceCount={source === "mixed" ? 2 : 1}
          issues={syntheticCount ? [`합성 레코드 ${syntheticCount}건은 실제 의사결정에 사용할 수 없습니다.`] : []}
        />
      </CardContent>
    </Card>
  );
}

interface CsvImportPanelProps {
  result: CompanyCsvImportResult | null;
  fileName: string;
  loading: boolean;
  error: string | null;
  selectedCompany: string;
  onSelectedCompanyChange: (value: string) => void;
  onUpload: (file: File) => void;
}

function CsvImportPanel({
  result,
  fileName,
  loading,
  error,
  selectedCompany,
  onSelectedCompanyChange,
  onUpload,
}: CsvImportPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function downloadTemplate() {
    const anchor = document.createElement("a");
    anchor.href = "/api/import";
    anchor.download = "bid-shield-company-template.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onUpload(file);
  }

  return (
    <Card>
      <CardHeader className="border-b border-border">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2"><Icon name="fileText" size={17} className="text-primary" />기업 재무 CSV</CardTitle>
            <CardDescription className="mt-1">KODATA 또는 내부 재무 데이터를 표준 스키마로 검증합니다.</CardDescription>
          </div>
          <Badge variant={result?.records.length ? "success" : "neutral"} dot={Boolean(result?.records.length)}>
            {result?.records.length ? `${result.records.length}개 기업 준비` : "미연결"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept=".csv,text/csv,application/csv"
          onChange={handleFileChange}
          aria-label="기업 재무 CSV 선택"
        />
        <div className="rounded-xl border border-dashed border-border bg-muted/15 p-5 text-center">
          <span className="mx-auto mb-3 flex size-10 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
            <Icon name="download" size={19} />
          </span>
          <p className="text-sm font-semibold text-foreground">UTF-8 또는 CP949 CSV · 최대 5MB</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">필수 열과 숫자·날짜 형식을 서버에서 검증하고, 유효한 행만 미리 보여줍니다.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button loading={loading} onClick={() => fileInputRef.current?.click()} leadingIcon={<Icon name="plus" size={15} />}>
              CSV 선택
            </Button>
            <Button variant="outline" onClick={downloadTemplate} leadingIcon={<Icon name="download" size={15} />}>
              템플릿 받기
            </Button>
          </div>
          {fileName && <p className="mt-3 truncate font-mono text-xs text-primary">{fileName}</p>}
        </div>

        <div aria-live="polite">
          {error && <Alert variant="destructive" title="CSV를 가져오지 못했습니다">{error}</Alert>}
          {result && (
            <Alert variant={result.summary.errorCount ? "warning" : "success"} title="검증 완료">
              전체 {result.summary.totalRows}행 중 {result.summary.acceptedRows}행 승인 · {result.summary.rejectedRows}행 제외 · 경고 {result.summary.warningCount}건
            </Alert>
          )}
        </div>

        {result && result.records.length > 0 && (
          <div>
            <label htmlFor="merge-company" className="mb-2 block text-xs font-semibold text-foreground">조달 데이터와 결합할 기업</label>
            <Select id="merge-company" value={selectedCompany} onChange={(event) => onSelectedCompanyChange(event.target.value)}>
              {result.records.map((company, index) => (
                <option key={companyKey(company, index)} value={companyKey(company, index)}>
                  {company.companyName}{company.creditGrade ? ` · ${company.creditGrade}` : ""}
                </option>
              ))}
            </Select>
          </div>
        )}

        {result && result.records.length > 0 && (
          <Table containerClassName="rounded-lg border border-border">
            <TableHeader><TableRow><TableHead>기업</TableHead><TableHead>연매출</TableHead><TableHead>현금</TableHead><TableHead>부채</TableHead><TableHead>기준일</TableHead></TableRow></TableHeader>
            <TableBody>
              {result.records.slice(0, 5).map((company, index) => (
                <TableRow key={companyKey(company, index)}>
                  <TableCell><p className="font-medium text-foreground">{company.companyName}</p><p className="mt-0.5 text-xs text-muted-foreground">{company.industryCode ?? "업종 미입력"}</p></TableCell>
                  <TableCell className="font-mono tabular-nums">{compactWon(company.annualRevenue)}</TableCell>
                  <TableCell className="font-mono tabular-nums">{compactWon(company.cashAndEquivalents)}</TableCell>
                  <TableCell className="font-mono tabular-nums">{compactWon(company.totalDebt)}</TableCell>
                  <TableCell className="text-muted-foreground">{company.asOfDate ? formatDate(company.asOfDate) : "미입력"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {result && result.issues.length > 0 && (
          <details className="rounded-lg border border-border bg-muted/20 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-foreground">검증 메시지 {result.issues.length}건</summary>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
              {result.issues.slice(0, 8).map((issue, index) => (
                <li key={`${issue.code}-${issue.row}-${index}`} className="flex gap-2">
                  <Badge variant={issue.severity === "error" ? "danger" : "warning"}>{issue.severity === "error" ? "오류" : "경고"}</Badge>
                  <span>{issue.row}행{issue.field ? ` · ${issue.field}` : ""}: {issue.message}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

interface ProcurementPanelProps {
  companies: CompanyFinancialImportRecord[];
  selectedCompany: string;
}

function ProcurementPanel({ companies, selectedCompany }: ProcurementPanelProps) {
  const { appendContracts, contracts } = useWorkspace();
  const [keyword, setKeyword] = useState("");
  const [resource, setResource] = useState<ProcurementResource | "all">("notice");
  const [kind, setKind] = useState<ProcurementKind | "all">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [allowFallback, setAllowFallback] = useState(true);
  const [result, setResult] = useState<ProcurementSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const company = useMemo(
    () => companies.find((entry, index) => companyKey(entry, index) === selectedCompany) ?? companies[0] ?? null,
    [companies, selectedCompany],
  );

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    if (from && to && from > to) {
      setError("시작일은 종료일보다 늦을 수 없습니다.");
      setSuccessMessage(null);
      return;
    }
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const params = new URLSearchParams({ resource, kind, pageSize: "20", fallback: String(allowFallback) });
      if (keyword.trim()) params.set("keyword", keyword.trim());
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const response = await fetch(`/api/procurement/search?${params.toString()}`, { cache: "no-store" });
      const body = await response.json() as ProcurementApiResponse;
      if (!response.ok || !body.ok) throw new Error(readApiError(body, "조달 데이터를 조회하지 못했습니다."));
      setResult(body.data);
    } catch (searchError) {
      setResult(null);
      setError(searchError instanceof Error ? searchError.message : "조달 데이터를 조회하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function addToWorkspace(record: ProcurementRecord) {
    if (!company) {
      setError("먼저 기업 재무 CSV를 가져오고 결합할 기업을 선택해 주세요.");
      setSuccessMessage(null);
      return;
    }
    if (!hasUsableAmount(record)) {
      setError("금액이 제공되지 않은 조달 건은 분석 계약으로 만들 수 없습니다.");
      setSuccessMessage(null);
      return;
    }
    try {
      const assumptions = conservativeAssumptions(record, company);
      const contract = createContractRecordFromSources(record, company, assumptions);
      appendContracts([contract], "api");
      setError(null);
      setSuccessMessage(
        `${record.title}을(를) 추가했습니다. 초기 가정: 원가율 ${formatPct(assumptions.estimatedCostRatePct)}, `
        + `수행 ${assumptions.durationMonths}개월, 회수 지연 ${assumptions.paymentDelayDays}일, 금리 ${formatPct(assumptions.annualInterestRatePct)}.`,
      );
    } catch (mergeError) {
      setSuccessMessage(null);
      setError(mergeError instanceof Error ? mergeError.message : "계약 레코드를 만들지 못했습니다.");
    }
  }

  const existingProcurementIds = useMemo(() => new Set(contracts.map((contract) => contract.procurementId)), [contracts]);

  return (
    <Card>
      <CardHeader className="border-b border-border">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2"><Icon name="database" size={17} className="text-primary" />나라장터 공개 데이터</CardTitle>
            <CardDescription className="mt-1">공고·낙찰·계약을 표준화해 기업 재무와 분석 계약으로 결합합니다.</CardDescription>
          </div>
          <Badge variant={result?.source === "live" ? "success" : result ? "warning" : "neutral"} dot={Boolean(result)}>
            {result?.source === "live" ? "LIVE" : result?.source === "mixed" ? "LIVE + DEMO" : result ? "DEMO" : "대기"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <form onSubmit={search} className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="md:col-span-2 xl:col-span-2">
            <label htmlFor="procurement-keyword" className="mb-1.5 block text-xs font-semibold text-foreground">검색어</label>
            <Input id="procurement-keyword" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="사업명·품명 키워드" />
          </div>
          <div>
            <label htmlFor="procurement-resource" className="mb-1.5 block text-xs font-semibold text-foreground">데이터셋</label>
            <Select id="procurement-resource" value={resource} onChange={(event) => setResource(event.target.value as ProcurementResource | "all")}>
              <option value="all">전체</option><option value="notice">공고</option><option value="award">낙찰</option><option value="contract">계약</option>
            </Select>
          </div>
          <div>
            <label htmlFor="procurement-kind" className="mb-1.5 block text-xs font-semibold text-foreground">업무 구분</label>
            <Select id="procurement-kind" value={kind} onChange={(event) => setKind(event.target.value as ProcurementKind | "all")}>
              <option value="all">전체</option><option value="construction">공사</option><option value="service">용역</option><option value="goods">물품</option>
            </Select>
          </div>
          <div>
            <label htmlFor="procurement-from" className="mb-1.5 block text-xs font-semibold text-foreground">시작일</label>
            <Input id="procurement-from" type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div>
            <label htmlFor="procurement-to" className="mb-1.5 block text-xs font-semibold text-foreground">종료일</label>
            <Input id="procurement-to" type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground md:col-span-1 xl:col-span-5">
            <input
              type="checkbox"
              checked={allowFallback}
              onChange={(event) => setAllowFallback(event.target.checked)}
              className="size-4 rounded border-border accent-primary"
            />
            인증키가 없거나 API가 응답하지 않으면 합성 데모 결과 표시
          </label>
          <Button type="submit" loading={loading} leadingIcon={<Icon name="search" size={15} />}>조회</Button>
        </form>

        {!company && (
          <Alert variant="warning" title="기업 재무 연결 필요">조회는 가능하지만 워크스페이스에 추가하려면 왼쪽에서 기업 재무 CSV를 먼저 가져와야 합니다.</Alert>
        )}
        {company && (
          <Alert variant="info" title={`${company.companyName}과 결합합니다`}>
            원가율·기간·지급조건은 업종별 보수 가정으로 채웁니다. 추가 후 계약 상세와 시나리오에서 실제 조건으로 보정하세요.
          </Alert>
        )}
        <div aria-live="polite" className="space-y-3">
          {error && <Alert variant="destructive" title="요청을 완료하지 못했습니다">{error}</Alert>}
          {successMessage && <Alert variant="success" title="분석 워크스페이스에 추가했습니다">{successMessage}</Alert>}
        </div>
        {result && result.source !== "live" && (
          <Alert variant="warning" title="합성 데이터가 포함된 결과입니다">
            이 결과를 분석에 추가하면 품질이 ‘합성’으로 표시됩니다. 실무 의사결정에는 원문 API 레코드를 사용하세요.
          </Alert>
        )}
        {result?.warnings.map((warning, index) => <Alert key={`${index}-${warning}`} variant="warning">{warning}</Alert>)}

        {result && result.items.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-10 text-center">
            <Icon name="search" size={24} className="mx-auto text-muted-foreground" />
            <p className="mt-3 text-sm font-semibold text-foreground">검색 결과가 없습니다</p>
            <p className="mt-1 text-xs text-muted-foreground">기간을 넓히거나 검색어를 줄여 다시 조회해 보세요.</p>
          </div>
        )}

        {result && result.items.length > 0 && (
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">검색 결과 <span className="font-mono text-primary">{result.totalCount.toLocaleString("ko-KR")}</span>건</p>
              <p className="text-xs text-muted-foreground">조회 {formatDate(result.fetchedAt)} · 화면에는 최대 20건</p>
            </div>
            <Table containerClassName="rounded-lg border border-border">
              <TableHeader><TableRow><TableHead>사업</TableHead><TableHead>기관</TableHead><TableHead>금액</TableHead><TableHead>낙찰률</TableHead><TableHead>출처</TableHead><TableHead className="text-end">작업</TableHead></TableRow></TableHeader>
              <TableBody>
                {result.items.map((record) => {
                  const amount = amountOf(record);
                  const usableAmount = hasUsableAmount(record);
                  const procurementId = record.bidNoticeNo ? `${record.bidNoticeNo}${record.bidNoticeOrder ? `-${record.bidNoticeOrder}` : ""}` : record.id;
                  const isAdded = existingProcurementIds.has(procurementId);
                  return (
                    <TableRow key={record.id}>
                      <TableCell className="max-w-[340px]">
                        <p className="line-clamp-2 font-medium text-foreground">{record.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {procurementLabel(record)} · {record.bidNoticeNo ?? record.contractNumber ?? "식별번호 미제공"}
                          {record.referenceUrl && (
                            <>
                              {" · "}
                              <a
                                href={record.referenceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium text-primary underline-offset-2 hover:underline"
                              >
                                원문
                                <span className="sr-only">(새 탭에서 열림)</span>
                              </a>
                            </>
                          )}
                        </p>
                      </TableCell>
                      <TableCell className="max-w-[180px] text-muted-foreground">{record.demandOrganization ?? record.organization ?? "미제공"}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono tabular-nums">{usableAmount && amount !== null ? compactWon(amount) : "미제공"}</TableCell>
                      <TableCell className="font-mono tabular-nums">{record.awardRate === null ? "—" : formatPct(record.awardRate)}</TableCell>
                      <TableCell><Badge variant={record.isSynthetic ? "warning" : "success"}>{record.isSynthetic ? "합성" : "공공데이터"}</Badge></TableCell>
                      <TableCell className="text-end">
                        <Button
                          size="sm"
                          variant={isAdded ? "ghost" : "outline"}
                          disabled={!company || !usableAmount || isAdded}
                          onClick={() => addToWorkspace(record)}
                          leadingIcon={<Icon name={isAdded ? "check" : "plus"} size={14} />}
                        >
                          {isAdded ? "추가됨" : "분석에 추가"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {!result && !loading && !error && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <Icon name="database" size={24} className="mx-auto text-muted-foreground" />
            <p className="mt-3 text-sm font-semibold text-foreground">조건을 입력해 조달 데이터를 조회하세요</p>
            <p className="mt-1 text-xs text-muted-foreground">인증키가 없으면 명확히 표시된 합성 데이터로 흐름을 체험할 수 있습니다.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function DataHubPage() {
  const [importResult, setImportResult] = useState<CompanyCsvImportResult | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState("");

  async function uploadCsv(file: File) {
    setImportError(null);
    setImportResult(null);
    setImportFileName(file.name);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setImportError(".csv 확장자의 파일을 선택해 주세요.");
      return;
    }
    if (file.size === 0) {
      setImportError("빈 파일은 가져올 수 없습니다.");
      return;
    }
    if (file.size > MAX_CSV_BYTES) {
      setImportError("CSV 파일은 5MB 이하여야 합니다.");
      return;
    }

    setImportLoading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/import", { method: "POST", body: formData });
      const body = await response.json() as ImportApiSuccess | ApiErrorBody;
      if (!response.ok || !body.ok) throw new Error(readApiError(body, "CSV를 검증하지 못했습니다."));
      setImportResult(body.data);
      const first = body.data.records[0];
      setSelectedCompany(first ? companyKey(first, 0) : "");
      if (body.data.records.length === 0) setImportError("분석에 사용할 수 있는 유효한 기업 행이 없습니다. 검증 메시지를 확인해 주세요.");
    } catch (uploadError) {
      setImportError(uploadError instanceof Error ? uploadError.message : "CSV를 검증하지 못했습니다.");
    } finally {
      setImportLoading(false);
    }
  }

  const companies = importResult?.records ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="DATA CONTROL PLANE"
        title="데이터 허브"
        description="기업 재무와 공공조달 데이터를 검증·결합하고, 분석에 투입되는 가정과 품질을 추적합니다."
      />

      <div className="space-y-6">
        <WorkspaceSummary />

        <Alert variant="info" title="데이터 경계와 비밀정보 보호">
          나라장터 인증키는 서버 환경변수 <code className="rounded bg-background/50 px-1.5 py-0.5 font-mono text-xs">KONEPS_SERVICE_KEY</code>에서만 읽습니다. CSV 원문은 검증 응답 후 폐기되고, 분석 워크스페이스는 현재 브라우저의 로컬 저장소에만 남습니다.
        </Alert>

        <div className="grid gap-6 2xl:grid-cols-[minmax(340px,0.82fr)_minmax(0,1.5fr)]">
          <CsvImportPanel
            result={importResult}
            fileName={importFileName}
            loading={importLoading}
            error={importError}
            selectedCompany={selectedCompany}
            onSelectedCompanyChange={setSelectedCompany}
            onUpload={uploadCsv}
          />
          <ProcurementPanel companies={companies} selectedCompany={selectedCompany} />
        </div>

        <Card>
          <CardHeader><CardTitle>결합 시 적용되는 보수 가정</CardTitle><CardDescription>조달 공개 데이터만으로 알 수 없는 값은 숨기지 않고 아래 규칙으로 초기화합니다.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["계약 원가율", "기업 영업이익률 역산 · 72~98% 제한"],
              ["회수 지연", "기업 평균 회수일 · 미입력 시 60일"],
              ["금리", "신용등급별 5.2~9.2% · 미입력 시 7.5%"],
              ["공정 조건", "공사·용역·물품별 기간·선급·보증 가정"],
              ["운영·상환 현금", "월 운영지출은 연매출의 4.5%/12, 월 원금상환은 총부채의 18%/12"],
              ["기업·지역 정보", "종업원 수로 규모 추정(미입력 시 소기업) · 지역은 ‘미입력’로 명시"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border bg-muted/20 p-4">
                <p className="text-xs font-semibold text-primary">{label}</p>
                <p className="mt-2 text-sm leading-6 text-foreground">{value}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Alert variant="warning" title="의사결정 전 확인">
          공개 데이터와 추정값은 신용평가 또는 대출 승인 결과가 아닙니다. 원계약서의 지급조건, 실제 원가계획, 최신 재무제표를 확인하고 데이터 품질이 ‘합성’ 또는 ‘추정’인 항목을 교체한 뒤 사용하세요.
        </Alert>
      </div>
    </div>
  );
}
