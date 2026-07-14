"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";

import { ActionLink, DataQualityBadge, EmptyContracts, RiskBadge, compactWon } from "@/components/features/contract-ui";
import { PageHeader } from "@/components/layout/page-header";
import { useWorkspace } from "@/components/providers/workspace-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { defaultScenario } from "@/data/demo";
import { analyzePortfolio } from "@/lib/analytics";
import type { RiskLevel } from "@/lib/domain";
import { formatDate, formatPct } from "@/lib/format";

type RiskFilter = "all" | RiskLevel;
type SortKey = "risk" | "funding" | "amount" | "margin" | "recent";
const PAGE_SIZE = 25;

const riskFilters: Array<{ value: RiskFilter; label: string }> = [
  { value: "all", label: "전체 위험" },
  { value: "critical", label: "위험" },
  { value: "high", label: "주의" },
  { value: "caution", label: "관찰" },
  { value: "low", label: "안정" },
];

export function ContractsPage() {
  const { contracts } = useWorkspace();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [risk, setRisk] = useState<RiskFilter>("all");
  const [sort, setSort] = useState<SortKey>("risk");
  const [page, setPage] = useState(1);
  const portfolio = useMemo(() => analyzePortfolio(contracts, defaultScenario), [contracts]);

  const rows = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLocaleLowerCase("ko-KR");
    const byId = new Map(contracts.map((contract) => [contract.id, contract]));
    const filtered = portfolio.contracts
      .map((analysis) => ({ analysis, record: byId.get(analysis.contractId)! }))
      .filter(({ analysis, record }) => {
        if (!record) return false;
        const matchesRisk = risk === "all" || analysis.riskLevel === risk;
        const haystack = [record.companyName, record.title, record.buyer, record.industry, record.procurementId]
          .join(" ")
          .toLocaleLowerCase("ko-KR");
        return matchesRisk && (!normalizedQuery || haystack.includes(normalizedQuery));
      });

    return filtered.sort((a, b) => {
      switch (sort) {
        case "funding":
          return b.analysis.peakCashShortfallKrw - a.analysis.peakCashShortfallKrw;
        case "amount":
          return b.record.contractAmountKrw - a.record.contractAmountKrw;
        case "margin":
          return a.analysis.survivalMarginPct - b.analysis.survivalMarginPct;
        case "recent":
          return Date.parse(b.record.awardedAt) - Date.parse(a.record.awardedAt);
        default:
          return b.analysis.riskScore - a.analysis.riskScore || b.analysis.peakCashShortfallKrw - a.analysis.peakCashShortfallKrw;
      }
    });
  }, [contracts, deferredQuery, portfolio.contracts, risk, sort]);

  const atRisk = portfolio.riskDistribution.high + portfolio.riskDistribution.critical;
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visibleRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <>
      <PageHeader
        eyebrow="CONTRACT RISK EXPLORER"
        title="계약 위험 탐색"
        description="기업·발주처·계약을 검색하고, 생존마진과 자금 공백이 취약한 순서로 검토합니다. 위험점수는 단일 신용등급이 아니라 계약 실행 조건을 함께 반영합니다."
        actions={<ActionLink href="/data" icon="plus" variant="primary">계약 추가</ActionLink>}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="계약 탐색 요약">
        <SummaryItem label="전체" value={`${portfolio.contractCount}건`} />
        <SummaryItem label="주의·위험" value={`${atRisk}건`} tone={atRisk ? "danger" : "default"} />
        <SummaryItem label="기업별 필요자금" value={compactWon(portfolio.totalFundingRequirementKrw)} tone={portfolio.totalFundingRequirementKrw ? "warning" : "default"} />
        <SummaryItem label="가중 위험점수" value={`${portfolio.weightedRiskScore.toFixed(1)}점`} />
      </div>

      <Card>
        <CardContent className="pt-5 sm:pt-6">
          <div className="grid gap-3 lg:grid-cols-[minmax(280px,1fr)_180px_190px]">
            <label className="relative block">
              <span className="sr-only">기업, 계약 또는 발주처 검색</span>
              <Icon name="search" size={16} className="pointer-events-none absolute start-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => { setQuery(event.target.value); setPage(1); }}
                placeholder="기업명, 계약명, 발주처, 공고번호 검색"
                className="ps-9"
                type="search"
              />
            </label>
            <label>
              <span className="sr-only">위험 등급 필터</span>
              <Select value={risk} onChange={(event) => { setRisk(event.target.value as RiskFilter); setPage(1); }}>
                {riskFilters.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
              </Select>
            </label>
            <label>
              <span className="sr-only">계약 정렬 방식</span>
              <Select value={sort} onChange={(event) => { setSort(event.target.value as SortKey); setPage(1); }}>
                <option value="risk">위험도 높은 순</option>
                <option value="funding">자금 공백 큰 순</option>
                <option value="amount">계약금액 큰 순</option>
                <option value="margin">생존마진 낮은 순</option>
                <option value="recent">최근 낙찰 순</option>
              </Select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
            <p className="text-xs text-muted-foreground">
              전체 {contracts.length.toLocaleString("ko-KR")}건 중 <strong className="font-semibold text-foreground">{rows.length.toLocaleString("ko-KR")}건</strong> 검색 · 페이지당 {PAGE_SIZE}건
            </p>
            {(query || risk !== "all") && (
              <button
                type="button"
                onClick={() => { setQuery(""); setRisk("all"); setPage(1); }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon name="refresh" size={14} /> 필터 초기화
              </button>
            )}
          </div>
        </CardContent>

        {contracts.length === 0 || rows.length === 0 ? (
          <div className="border-t border-border"><EmptyContracts filtered={contracts.length > 0} /></div>
        ) : (
          <div className="border-t border-border">
            <Table containerClassName="rounded-b-xl" className="min-w-[1060px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="ps-5 sm:ps-6">기업 / 계약</TableHead>
                  <TableHead>발주처</TableHead>
                  <TableHead className="text-right">계약금액</TableHead>
                  <TableHead className="text-right">낙찰률</TableHead>
                  <TableHead className="text-right">생존마진</TableHead>
                  <TableHead className="text-right">자금 공백</TableHead>
                  <TableHead>현금 런웨이</TableHead>
                  <TableHead className="text-center">위험</TableHead>
                  <TableHead aria-label="계약 상세" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map(({ analysis, record }) => (
                  <TableRow key={record.id}>
                    <TableCell className="max-w-[300px] ps-5 sm:ps-6">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground" aria-hidden="true">
                          <Icon name="building" size={15} />
                        </span>
                        <div className="min-w-0">
                          <Link href={`/contracts/${encodeURIComponent(record.id)}`} className="block truncate font-semibold text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            {record.companyName}
                          </Link>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground" title={record.title}>{record.title}</p>
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <DataQualityBadge quality={record.dataQuality} />
                            <span className="text-[10px] text-muted-foreground">{formatDate(record.awardedAt)}</span>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground" title={record.buyer}>{record.buyer}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-semibold tabular-nums">{compactWon(record.contractAmountKrw)}</TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">{formatPct(record.bidRatePct, 2)}</TableCell>
                    <TableCell className={`text-right font-mono text-xs font-semibold tabular-nums ${analysis.survivalMarginPct < 0 ? "text-red-300" : analysis.survivalMarginPct < 5 ? "text-warning" : "text-foreground"}`}>
                      {formatPct(analysis.survivalMarginPct)}
                    </TableCell>
                    <TableCell className={`text-right font-mono text-xs tabular-nums ${analysis.peakCashShortfallKrw > 0 ? "text-warning" : "text-muted-foreground"}`}>
                      {compactWon(analysis.peakCashShortfallKrw)}
                    </TableCell>
                    <TableCell>
                      <p className="text-xs font-medium text-foreground">{analysis.cashRunwayLabel}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">최저 {compactWon(analysis.minimumCashBalanceKrw)}</p>
                    </TableCell>
                    <TableCell className="text-center"><RiskBadge level={analysis.riskLevel} score={analysis.riskScore} /></TableCell>
                    <TableCell className="pe-5 text-right sm:pe-6">
                      <Link
                        href={`/contracts/${encodeURIComponent(record.id)}`}
                        aria-label={`${record.companyName} ${record.title} 상세분석`}
                        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Icon name="chevronRight" size={16} />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {pageCount > 1 && (
              <nav aria-label="계약 목록 페이지" className="flex items-center justify-between gap-3 border-t border-border px-5 py-4 sm:px-6">
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono font-semibold text-foreground">{safePage}</span> / {pageCount} 페이지
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={safePage <= 1}
                    onClick={() => setPage(Math.max(1, safePage - 1))}
                    leadingIcon={<Icon name="chevronLeft" size={14} />}
                  >
                    이전
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={safePage >= pageCount}
                    onClick={() => setPage(Math.min(pageCount, safePage + 1))}
                  >
                    다음
                    <Icon name="chevronRight" size={14} />
                  </Button>
                </div>
              </nav>
            )}
          </div>
        )}
      </Card>

      <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
        생존마진은 예상 계약이익에서 금융비용을 차감한 값입니다. 결과는 위험 선별용이며 신용평가나 대출 승인 결과를 의미하지 않습니다.
      </p>
    </>
  );
}

function SummaryItem({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warning" | "danger" }) {
  const valueClass = tone === "danger" ? "text-red-300" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card/70 px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className={`mt-1 font-mono text-sm font-semibold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}
