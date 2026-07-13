"use client";

import Link from "next/link";
import { useMemo } from "react";

import { ActionLink, EmptyContracts, MetricCard, RiskBadge, compactWon } from "@/components/features/contract-ui";
import { PageHeader } from "@/components/layout/page-header";
import { useWorkspace } from "@/components/providers/workspace-provider";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DonutChart, HorizontalBarChart, MiniLineChart } from "@/components/ui/charts";
import { Icon } from "@/components/ui/icons";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { defaultScenario } from "@/data/demo";
import { analyzePortfolio } from "@/lib/analytics";
import type { ContractAnalysis, RiskContribution, RiskLevel } from "@/lib/domain";
import { formatPct, riskMeta } from "@/lib/format";

const riskOrder: RiskLevel[] = ["critical", "high", "caution", "low"];

function averageRiskDrivers(contracts: readonly ContractAnalysis[]) {
  const drivers = new Map<string, { label: string; points: number; maxPoints: number; count: number }>();

  for (const contract of contracts) {
    for (const contribution of contract.riskContributions) {
      const current = drivers.get(contribution.id) ?? {
        label: contribution.label,
        points: 0,
        maxPoints: contribution.maxPoints,
        count: 0,
      };
      current.points += contribution.points;
      current.count += 1;
      drivers.set(contribution.id, current);
    }
  }

  return [...drivers.values()]
    .map((driver) => ({
      label: driver.label,
      value: driver.count ? driver.points / driver.count : 0,
      valueLabel: `${(driver.count ? driver.points / driver.count : 0).toFixed(1)} / ${driver.maxPoints}`,
      color: "var(--primary)",
    }))
    .sort((a, b) => b.value - a.value);
}

function dominantDriver(contract: ContractAnalysis): RiskContribution | undefined {
  return [...contract.riskContributions].sort(
    (a, b) => b.points / Math.max(b.maxPoints, 1) - a.points / Math.max(a.maxPoints, 1),
  )[0];
}

export function OverviewPage() {
  const { contracts, source } = useWorkspace();
  const portfolio = useMemo(() => analyzePortfolio(contracts, defaultScenario), [contracts]);
  const atRiskCount = portfolio.riskDistribution.high + portfolio.riskDistribution.critical;
  const riskDrivers = useMemo(() => averageRiskDrivers(portfolio.contracts), [portfolio.contracts]);
  const actionQueue = useMemo(
    () =>
      [...portfolio.contracts]
        .filter((contract) => contract.financingRecommendation.fundingRequirementKrw > 0)
        .sort(
          (a, b) =>
            b.financingRecommendation.fundingRequirementKrw -
              a.financingRecommendation.fundingRequirementKrw || b.riskScore - a.riskScore,
        )
        .slice(0, 4),
    [portfolio.contracts],
  );

  const riskDistribution = riskOrder.map((level) => ({
    label: riskMeta[level].label,
    value: portfolio.riskDistribution[level],
    color: riskMeta[level].color,
  }));

  return (
    <>
      <PageHeader
        eyebrow="PORTFOLIO CONTROL TOWER"
        title="입찰 계약 생존 대시보드"
        description="낙찰 이후의 이익률만 보지 않고, 대금 회수 시점과 실행비용을 월별 현금흐름으로 연결해 위험 계약과 필요한 금융조치를 먼저 찾습니다."
        actions={
          <div className="flex flex-wrap gap-2">
            <ActionLink href="/scenario" icon="activity">스트레스 테스트</ActionLink>
            <ActionLink href="/data" icon="database" variant="primary">데이터 연결</ActionLink>
          </div>
        }
      />

      {(source === "demo" || contracts.some((contract) => contract.isSynthetic)) && (
        <Alert variant="info" title="현재 결과는 의사결정 예행연습용입니다" className="mb-6">
          합성 데이터 또는 추정값이 포함되어 있습니다. 실제 금융 실행 전에는 계약서, 원가 내역, 매출채권과 부채 정보를 검증하세요.
        </Alert>
      )}

      <section aria-labelledby="portfolio-summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <h2 id="portfolio-summary" className="sr-only">포트폴리오 핵심 지표</h2>
        <MetricCard
          label="분석 계약"
          value={`${portfolio.contractCount.toLocaleString("ko-KR")}건`}
          description="현재 작업공간에 등록된 낙찰 계약"
          icon="briefcase"
        />
        <MetricCard
          label="총 계약금액"
          value={compactWon(portfolio.totalContractAmountKrw)}
          description={`매출액 가중 위험점수 ${portfolio.weightedRiskScore.toFixed(1)}점`}
          icon="bank"
          tone="success"
        />
        <MetricCard
          label="고위험 계약"
          value={`${atRiskCount.toLocaleString("ko-KR")}건`}
          description="주의·위험 등급으로 선제 대응 필요"
          icon="alertTriangle"
          tone={atRiskCount > 0 ? "danger" : "success"}
        />
        <MetricCard
          label="권고 필요자금"
          value={compactWon(portfolio.totalFundingRequirementKrw)}
          description="현금 공백과 유동성 버퍼를 포함한 권고액"
          icon="wallet"
          tone={portfolio.totalFundingRequirementKrw > 0 ? "warning" : "success"}
        />
      </section>

      {contracts.length === 0 ? (
        <Card className="mt-6"><EmptyContracts /></Card>
      ) : (
        <>
          <section aria-label="포트폴리오 위험과 현금흐름" className="mt-6 grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
            <Card>
              <CardHeader className="flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>위험 등급 분포</CardTitle>
                  <CardDescription>계약 수 기준의 현재 위험 구성</CardDescription>
                </div>
                <RiskBadge level={portfolio.riskLevel} score={portfolio.weightedRiskScore} />
              </CardHeader>
              <CardContent>
                <DonutChart
                  data={riskDistribution}
                  ariaLabel="계약 위험 등급별 분포"
                  centerValue={`${portfolio.contractCount}건`}
                  centerLabel="전체 계약"
                  className="mx-auto max-w-md"
                />
                <div className="mt-6 rounded-lg border border-border/70 bg-muted/25 p-4">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">예상 생존마진 합계</span>
                    <span className={`font-mono font-semibold tabular-nums ${portfolio.totalSurvivalMarginKrw < 0 ? "text-red-300" : "text-foreground"}`}>
                      {compactWon(portfolio.totalSurvivalMarginKrw)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>12개월 예상 현금잔액</CardTitle>
                  <CardDescription>동일 기업의 현금·공통비 중복을 조정한 포트폴리오 유동성 궤적</CardDescription>
                </div>
                <Badge variant={portfolio.monthlyCashflow.some((month) => month.endingCashBalanceKrw < 0) ? "warning" : "success"}>
                  {portfolio.monthlyCashflow.some((month) => month.endingCashBalanceKrw < 0) ? "공백 발생" : "잔액 유지"}
                </Badge>
              </CardHeader>
              <CardContent>
                <MiniLineChart
                  data={portfolio.monthlyCashflow.map((month) => ({ label: month.label, value: month.endingCashBalanceKrw }))}
                  ariaLabel="포트폴리오 월별 예상 현금잔액 추이"
                  height={186}
                  showPoints
                />
                <div className="mt-4 grid grid-cols-3 divide-x divide-border rounded-lg border border-border bg-muted/20 py-3 text-center">
                  {[0, 5, 11].map((index) => {
                    const month = portfolio.monthlyCashflow[index];
                    return (
                      <div key={month.label} className="min-w-0 px-2">
                        <p className="text-[10px] text-muted-foreground">{month.label}</p>
                        <p className={`mt-1 truncate font-mono text-xs font-semibold tabular-nums ${month.endingCashBalanceKrw < 0 ? "text-red-300" : "text-foreground"}`}>
                          {compactWon(month.endingCashBalanceKrw)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </section>

          <section aria-label="위험 원인과 대응 순서" className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>포트폴리오 위험 원인</CardTitle>
                <CardDescription>계약별 위험점수 기여도의 단순 평균으로, 점수가 클수록 먼저 확인해야 합니다.</CardDescription>
              </CardHeader>
              <CardContent>
                <HorizontalBarChart data={riskDrivers} max={30} ariaLabel="포트폴리오 위험 요인별 평균 기여점수" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>금융조치 큐</CardTitle>
                  <CardDescription>자금 공백 규모가 큰 계약부터 실행 우선순위 제안</CardDescription>
                </div>
                <Link href="/contracts" className="text-xs font-semibold text-primary hover:underline">전체 보기</Link>
              </CardHeader>
              <CardContent className="space-y-3">
                {actionQueue.length === 0 ? (
                  <div className="flex min-h-44 flex-col items-center justify-center rounded-lg border border-dashed border-border px-5 text-center">
                    <Icon name="checkCircle" className="text-success" size={22} />
                    <p className="mt-3 text-sm font-semibold">즉시 대응할 자금 공백이 없습니다</p>
                    <p className="mt-1 text-xs text-muted-foreground">스트레스 시나리오에서도 다시 확인해 보세요.</p>
                  </div>
                ) : (
                  actionQueue.map((contract, index) => {
                    const firstInstrument = contract.financingRecommendation.structure[0];
                    return (
                      <Link
                        key={contract.contractId}
                        href={`/contracts/${encodeURIComponent(contract.contractId)}`}
                        className="group flex items-center gap-3 rounded-lg border border-border/75 bg-muted/15 p-3 transition-colors hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-mono text-xs font-bold text-primary">{index + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-foreground">{contract.companyName}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {firstInstrument?.label ?? "운전자금 점검"} · {compactWon(contract.financingRecommendation.fundingRequirementKrw)}
                          </span>
                        </span>
                        <Icon name="chevronRight" size={16} className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                      </Link>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="top-risk-title" className="mt-4">
            <Card>
              <CardHeader className="flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle id="top-risk-title">우선 검토 계약</CardTitle>
                  <CardDescription>위험점수와 최대 현금 부족분을 기준으로 정렬했습니다.</CardDescription>
                </div>
                <ActionLink href="/contracts" variant="ghost">계약 탐색</ActionLink>
              </CardHeader>
              <CardContent className="px-0 pb-1 sm:px-0 sm:pb-1">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="ps-5 sm:ps-6">기업 / 계약</TableHead>
                      <TableHead>핵심 원인</TableHead>
                      <TableHead className="text-right">생존마진</TableHead>
                      <TableHead className="text-right">자금 공백</TableHead>
                      <TableHead className="text-center">위험</TableHead>
                      <TableHead aria-label="상세 이동" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {portfolio.topRiskContracts.map((contract) => {
                      const driver = dominantDriver(contract);
                      return (
                        <TableRow key={contract.contractId}>
                          <TableCell className="max-w-[260px] ps-5 sm:ps-6">
                            <p className="truncate font-semibold text-foreground">{contract.companyName}</p>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">{contract.contractTitle}</p>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">{driver?.label ?? "위험 요인"}</span>
                          </TableCell>
                          <TableCell className={`text-right font-mono text-xs font-semibold tabular-nums ${contract.survivalMarginKrw < 0 ? "text-red-300" : "text-foreground"}`}>
                            {formatPct(contract.survivalMarginPct)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs tabular-nums text-foreground">
                            {compactWon(contract.peakCashShortfallKrw)}
                          </TableCell>
                          <TableCell className="text-center"><RiskBadge level={contract.riskLevel} score={contract.riskScore} /></TableCell>
                          <TableCell className="pe-5 text-right sm:pe-6">
                            <Link href={`/contracts/${encodeURIComponent(contract.contractId)}`} aria-label={`${contract.companyName} 계약 상세`} className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                              <Icon name="chevronRight" size={16} />
                            </Link>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </>
  );
}
