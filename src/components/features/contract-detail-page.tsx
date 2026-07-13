"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, type FormEvent } from "react";

import { ActionLink, DataQualityBadge, MetricCard, RiskBadge, compactWon } from "@/components/features/contract-ui";
import { PageHeader } from "@/components/layout/page-header";
import { useWorkspace } from "@/components/providers/workspace-provider";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DonutChart, MiniLineChart, RadarChart } from "@/components/ui/charts";
import { Icon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Progress, type ProgressTone } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { defaultScenario } from "@/data/demo";
import { analyzeContract, runScenario } from "@/lib/analytics";
import type { ContractRecord, RiskLevel } from "@/lib/domain";
import { formatDate, formatKrw, formatPct, riskMeta } from "@/lib/format";

const companySizeLabel: Record<ContractRecord["companySize"], string> = {
  micro: "소상공인",
  small: "소기업",
  medium: "중견기업",
  large: "대기업",
};

const paymentScheduleLabel: Record<ContractRecord["paymentSchedule"], string> = {
  monthly: "월별 기성",
  milestone: "단계별 지급",
  completion: "완료 후 일괄 지급",
};

const contributionTone: Record<RiskLevel, ProgressTone> = {
  low: "success",
  caution: "primary",
  high: "warning",
  critical: "danger",
};

interface BaselineForm {
  estimatedTotalCostKrw: string;
  availableCashKrw: string;
  monthlyOperatingCashOutflowKrw: string;
  existingBorrowingsKrw: string;
  monthlyDebtServiceKrw: string;
  annualInterestRatePct: string;
  durationMonths: string;
  paymentDelayDays: string;
  advancePaymentRatePct: string;
  retentionRatePct: string;
  guaranteeDepositRatePct: string;
  upfrontCostRatePct: string;
  fixedCostRatePct: string;
  paymentSchedule: ContractRecord["paymentSchedule"];
}

type NumericBaselineField = Exclude<keyof BaselineForm, "paymentSchedule">;
type BaselineErrors = Partial<Record<keyof BaselineForm, string>>;

const numericFieldRules: Record<
  NumericBaselineField,
  { label: string; min: number; max: number; integer?: boolean }
> = {
  estimatedTotalCostKrw: { label: "예상 총원가", min: 0, max: 1_000_000_000_000_000 },
  availableCashKrw: { label: "가용현금", min: 0, max: 1_000_000_000_000_000 },
  monthlyOperatingCashOutflowKrw: { label: "월 영업현금유출", min: 0, max: 1_000_000_000_000_000 },
  existingBorrowingsKrw: { label: "기존 차입금", min: 0, max: 1_000_000_000_000_000 },
  monthlyDebtServiceKrw: { label: "월 예정 부채상환", min: 0, max: 1_000_000_000_000_000 },
  annualInterestRatePct: { label: "연 이자율", min: 0, max: 50 },
  durationMonths: { label: "수행기간", min: 1, max: 120, integer: true },
  paymentDelayDays: { label: "기본 회수지연", min: 0, max: 730, integer: true },
  advancePaymentRatePct: { label: "선금률", min: 0, max: 100 },
  retentionRatePct: { label: "유보금률", min: 0, max: 30 },
  guaranteeDepositRatePct: { label: "계약보증률", min: 0, max: 30 },
  upfrontCostRatePct: { label: "초기 원가 비중", min: 0, max: 100 },
  fixedCostRatePct: { label: "고정원가 비중", min: 0, max: 100 },
};

const numericBaselineFields = Object.keys(numericFieldRules) as NumericBaselineField[];

function baselineFormFromContract(contract: ContractRecord): BaselineForm {
  return {
    estimatedTotalCostKrw: String(contract.estimatedTotalCostKrw),
    availableCashKrw: String(contract.availableCashKrw),
    monthlyOperatingCashOutflowKrw: String(contract.monthlyOperatingCashOutflowKrw),
    existingBorrowingsKrw: String(contract.existingBorrowingsKrw),
    monthlyDebtServiceKrw: String(contract.monthlyDebtServiceKrw),
    annualInterestRatePct: String(contract.annualInterestRatePct),
    durationMonths: String(contract.durationMonths),
    paymentDelayDays: String(contract.paymentDelayDays),
    advancePaymentRatePct: String(contract.advancePaymentRatePct),
    retentionRatePct: String(contract.retentionRatePct),
    guaranteeDepositRatePct: String(contract.guaranteeDepositRatePct),
    upfrontCostRatePct: String(contract.upfrontCostRatePct),
    fixedCostRatePct: String(contract.fixedCostRatePct),
    paymentSchedule: contract.paymentSchedule,
  };
}

function validateBaselineForm(form: BaselineForm, contractAmountKrw: number) {
  const errors: BaselineErrors = {};
  const values = {} as Record<NumericBaselineField, number>;

  for (const field of numericBaselineFields) {
    const rule = numericFieldRules[field];
    const raw = form[field].trim();
    const value = raw === "" ? Number.NaN : Number(raw);
    if (!Number.isFinite(value)) {
      errors[field] = `${rule.label}에 유효한 숫자를 입력해 주세요.`;
      continue;
    }
    if (value < rule.min || value > rule.max) {
      errors[field] = `${rule.label}은(는) ${rule.min.toLocaleString("ko-KR")}~${rule.max.toLocaleString("ko-KR")} 범위여야 합니다.`;
      continue;
    }
    if (rule.integer && !Number.isInteger(value)) {
      errors[field] = `${rule.label}은(는) 정수로 입력해 주세요.`;
      continue;
    }
    values[field] = value;
  }

  if (!errors.estimatedTotalCostKrw && contractAmountKrw > 0 && values.estimatedTotalCostKrw > contractAmountKrw * 3) {
    errors.estimatedTotalCostKrw = "예상 총원가는 계약금액의 300% 이하로 입력해 주세요.";
  }
  if (
    !errors.advancePaymentRatePct &&
    !errors.retentionRatePct &&
    values.advancePaymentRatePct + values.retentionRatePct > 100
  ) {
    errors.advancePaymentRatePct = "선금률과 유보금률의 합은 100%를 넘을 수 없습니다.";
    errors.retentionRatePct = "선금률과 유보금률의 합은 100%를 넘을 수 없습니다.";
  }
  if (
    !errors.monthlyDebtServiceKrw &&
    !errors.existingBorrowingsKrw &&
    values.monthlyDebtServiceKrw > values.existingBorrowingsKrw
  ) {
    errors.monthlyDebtServiceKrw = "월 예정 원금상환액은 기존 차입금보다 클 수 없습니다.";
  }

  return { errors, values, valid: Object.keys(errors).length === 0 };
}

export function ContractDetailPage({ contractId }: { contractId: string }) {
  const router = useRouter();
  const editorFormId = useId();
  const { contracts, hydrated, removeContract, updateContract } = useWorkspace();
  const [editorOpen, setEditorOpen] = useState(false);
  const [baselineForm, setBaselineForm] = useState<BaselineForm | null>(null);
  const [baselineErrors, setBaselineErrors] = useState<BaselineErrors>({});
  const contract = contracts.find((item) => item.id === contractId);
  const analysis = useMemo(() => (contract ? analyzeContract(contract, defaultScenario) : null), [contract]);
  const quickStress = useMemo(
    () =>
      contract
        ? runScenario(contract, {
            costInflationPct: 10,
            paymentDelayDays: 30,
            interestRateChangePctPoints: 2,
            orderVolumeChangePct: 0,
          })
        : null,
    [contract],
  );

  function openBaselineEditor() {
    if (!contract) return;
    setBaselineForm(baselineFormFromContract(contract));
    setBaselineErrors({});
    setEditorOpen(true);
  }

  function closeBaselineEditor() {
    setEditorOpen(false);
    setBaselineErrors({});
  }

  function setBaselineValue(field: keyof BaselineForm, value: string) {
    setBaselineForm((current) => (current ? { ...current, [field]: value } : current));
    setBaselineErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function saveBaseline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contract || !baselineForm) return;
    const result = validateBaselineForm(baselineForm, contract.contractAmountKrw);
    if (!result.valid) {
      setBaselineErrors(result.errors);
      return;
    }

    updateContract({
      ...contract,
      ...result.values,
      paymentSchedule: baselineForm.paymentSchedule,
      dataQuality: contract.isSynthetic ? "synthetic" : "estimated",
      isSynthetic: contract.isSynthetic,
    });
    closeBaselineEditor();
  }

  function deleteContract() {
    if (!contract) return;
    const confirmed = window.confirm(
      `“${contract.companyName} · ${contract.title}” 계약을 작업공간에서 삭제할까요? 이 작업은 되돌릴 수 없습니다.`,
    );
    if (!confirmed) return;
    removeContract(contract.id);
    setEditorOpen(false);
    router.push("/contracts");
  }

  if (!contract || !analysis || !quickStress) {
    if (!hydrated) {
      return (
        <Card className="min-h-72 animate-pulse" aria-label="계약 분석 불러오는 중">
          <CardContent className="flex min-h-72 items-center justify-center pt-6 text-sm text-muted-foreground">계약 분석을 불러오고 있습니다…</CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <CardContent className="flex min-h-96 flex-col items-center justify-center px-6 pt-6 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground"><Icon name="search" size={22} /></span>
          <h1 className="mt-4 text-lg font-semibold">계약을 찾을 수 없습니다</h1>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">작업공간에서 삭제됐거나 주소가 변경된 계약입니다. 계약 목록에서 다시 선택해 주세요.</p>
          <div className="mt-5"><ActionLink href="/contracts" icon="chevronLeft">계약 목록으로</ActionLink></div>
        </CardContent>
      </Card>
    );
  }

  const finance = analysis.financingRecommendation;
  const stress = quickStress.stressed;
  const financeDonut = finance.structure
    .filter((item) => item.amountKrw > 0 && item.type !== "guarantee-reserve")
    .map((item, index) => ({
      label: item.label,
      value: item.amountKrw,
      color: ["var(--primary)", "var(--success)", "var(--warning)", "oklch(0.66 0.16 260)"][index % 4],
    }));

  return (
    <>
      <nav aria-label="계약 상세 경로" className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href="/contracts" className="hover:text-primary hover:underline">계약 탐색</Link>
        <Icon name="chevronRight" size={13} aria-hidden="true" />
        <span className="max-w-60 truncate text-foreground">{contract.companyName}</span>
      </nav>

      <PageHeader
        eyebrow={`CONTRACT · ${contract.procurementId}`}
        title={contract.companyName}
        description={contract.title}
        actions={
          <div className="flex flex-wrap gap-2">
            <ActionLink href={`/scenario?contract=${encodeURIComponent(contract.id)}`} icon="activity" variant="primary">시나리오 분석</ActionLink>
            <Button
              variant="outline"
              leadingIcon={<Icon name="settings" size={15} aria-hidden="true" />}
              aria-haspopup="dialog"
              onClick={openBaselineEditor}
            >
              기준 가정 편집
            </Button>
            <ActionLink href="/contracts" icon="chevronLeft">목록</ActionLink>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <RiskBadge level={analysis.riskLevel} score={analysis.riskScore} />
        <DataQualityBadge quality={contract.dataQuality} />
        <Badge variant="outline">{contract.industry}</Badge>
        <Badge variant="outline">{companySizeLabel[contract.companySize]}</Badge>
        <span className="text-xs text-muted-foreground">낙찰일 {formatDate(contract.awardedAt)}</span>
      </div>

      {analysis.alerts.length > 0 && (
        <Alert
          variant={analysis.riskLevel === "critical" ? "destructive" : "warning"}
          title={`${analysis.alerts.length}개의 선제 대응 신호`}
          className="mb-6"
        >
          <ul className="space-y-1.5">
            {analysis.alerts.map((alert) => <li key={alert}>• {alert}</li>)}
          </ul>
        </Alert>
      )}

      <section aria-labelledby="contract-metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <h2 id="contract-metrics" className="sr-only">계약 핵심 분석지표</h2>
        <MetricCard
          label="생존마진"
          value={formatPct(analysis.survivalMarginPct)}
          description={`${compactWon(analysis.survivalMarginKrw)} · 금융비용 차감 후`}
          icon="trendingUp"
          tone={analysis.survivalMarginPct < 0 ? "danger" : analysis.survivalMarginPct < 5 ? "warning" : "success"}
        />
        <MetricCard
          label="최대 자금 공백"
          value={compactWon(analysis.peakCashShortfallKrw)}
          description={`최저 현금잔액 ${compactWon(analysis.minimumCashBalanceKrw)}`}
          icon="wallet"
          tone={analysis.peakCashShortfallKrw > 0 ? "warning" : "success"}
        />
        <MetricCard
          label="현금 런웨이"
          value={analysis.cashRunwayLabel}
          description="현금잔액이 음수로 전환되기 전 기간"
          icon="clock"
          tone={analysis.cashRunwayMonths < 4 ? "danger" : analysis.cashRunwayMonths < 8 ? "warning" : "success"}
        />
        <MetricCard
          label="원가충격 여력"
          value={formatPct(analysis.remainingCostShockHeadroomPct)}
          description={`손익분기 원가상승 ${formatPct(analysis.breakEvenCostShockPct)}`}
          icon="shield"
          tone={analysis.remainingCostShockHeadroomPct < 5 ? "danger" : analysis.remainingCostShockHeadroomPct < 12 ? "warning" : "success"}
        />
      </section>

      <section aria-label="위험 진단과 현금흐름" className="mt-6 grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>위험점수 해부</CardTitle>
              <CardDescription>점수의 근거를 요인별로 확인합니다.</CardDescription>
            </div>
            <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">{analysis.riskScore}<span className="text-xs text-muted-foreground"> / 100</span></span>
          </CardHeader>
          <CardContent>
            <RadarChart
              data={analysis.riskContributions.map((item) => ({ label: item.label, value: item.points, max: item.maxPoints }))}
              ariaLabel={`${contract.companyName} 계약 위험 요인 레이더`}
              className="mx-auto max-w-[310px]"
              color={riskMeta[analysis.riskLevel].color}
            />
            <div className="mt-3 space-y-4">
              {analysis.riskContributions.map((item) => (
                <div key={item.id}>
                  <Progress
                    label={item.label}
                    value={item.points}
                    max={item.maxPoints}
                    valueLabel={`${item.points.toFixed(1)} / ${item.maxPoints} · ${item.displayValue}`}
                    tone={contributionTone[item.severity]}
                    size="sm"
                  />
                  <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">{item.explanation}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>12개월 계약 현금흐름</CardTitle>
              <CardDescription>계약 유입, 실행비용, 영업비용, 부채상환을 반영한 월말 잔액</CardDescription>
            </div>
            <Badge variant={analysis.minimumCashBalanceKrw < 0 ? "warning" : "success"}>
              {analysis.minimumCashBalanceKrw < 0 ? "유동성 공백" : "잔액 방어"}
            </Badge>
          </CardHeader>
          <CardContent>
            <MiniLineChart
              data={analysis.monthlyCashflow.map((month) => ({ label: month.label, value: month.endingCashBalanceKrw }))}
              ariaLabel={`${contract.companyName} 12개월 예상 현금잔액`}
              color={riskMeta[analysis.riskLevel].color}
              height={190}
              showPoints
            />
            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
              <MiniMetric label="12개월 유입" value={compactWon(analysis.totalInflows12mKrw)} />
              <MiniMetric label="12개월 유출" value={compactWon(analysis.totalOutflows12mKrw)} />
              <MiniMetric label="기성 후 미회수" value={compactWon(analysis.remainingReceivablesAfter12mKrw)} />
              <MiniMetric label="잔여 계약가액" value={compactWon(analysis.remainingContractValueAfter12mKrw)} />
              <MiniMetric label="금융비용" value={compactWon(analysis.estimatedFinancingCostKrw)} />
            </div>
            <details className="group mt-5 rounded-lg border border-border bg-muted/15">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                월별 현금흐름 원장 보기
                <Icon name="chevronDown" size={15} className="transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-border">
                <Table className="min-w-[830px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="ps-4">월</TableHead>
                      <TableHead className="text-right">계약 유입</TableHead>
                      <TableHead className="text-right">계약 원가</TableHead>
                      <TableHead className="text-right">영업·부채 유출</TableHead>
                      <TableHead className="text-right">순현금흐름</TableHead>
                      <TableHead className="pe-4 text-right">월말 잔액</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analysis.monthlyCashflow.map((month) => (
                      <TableRow key={month.month}>
                        <TableCell className="ps-4 text-xs font-medium">{month.label}</TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">{compactWon(month.contractInflowsKrw)}</TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">{compactWon(month.contractCostsKrw)}</TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">{compactWon(month.operatingOutflowsKrw + month.debtServiceKrw + month.borrowingInterestKrw)}</TableCell>
                        <TableCell className={`text-right font-mono text-xs font-semibold tabular-nums ${month.netCashflowKrw < 0 ? "text-red-300" : "text-success"}`}>{compactWon(month.netCashflowKrw)}</TableCell>
                        <TableCell className={`pe-4 text-right font-mono text-xs font-semibold tabular-nums ${month.endingCashBalanceKrw < 0 ? "text-red-300" : "text-foreground"}`}>{compactWon(month.endingCashBalanceKrw)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </details>
          </CardContent>
        </Card>
      </section>

      <section aria-label="권고 금융구조" className="mt-4 grid gap-4 xl:grid-cols-[1fr_1.25fr]">
        <Card>
          <CardHeader>
            <CardTitle>권고 금융 패키지</CardTitle>
            <CardDescription>현금 공백과 완충자금을 함께 충족하도록 수단을 조합했습니다.</CardDescription>
          </CardHeader>
          <CardContent>
            {financeDonut.length > 0 ? (
              <DonutChart
                data={financeDonut}
                ariaLabel="권고 금융수단 구성"
                centerValue={compactWon(finance.totalLiquidityPackageKrw)}
                centerLabel="총 유동성"
                className="mx-auto max-w-lg"
              />
            ) : (
              <div className="flex min-h-36 flex-col items-center justify-center rounded-lg border border-dashed border-border text-center">
                <Icon name="checkCircle" size={22} className="text-success" />
                <p className="mt-2 text-sm font-semibold">추가 금융조달이 필요하지 않습니다</p>
              </div>
            )}
            <dl className="mt-5 grid grid-cols-2 gap-3">
              <MiniDefinition label="필요자금" value={formatKrw(finance.fundingRequirementKrw)} />
              <MiniDefinition label="유동성 버퍼" value={formatKrw(finance.liquidityBufferKrw)} />
              <MiniDefinition label="예상 금융비용" value={formatKrw(finance.expectedFinancingCostKrw)} />
              <MiniDefinition label="공백 커버리지" value={formatPct(finance.coveragePct)} />
              <MiniDefinition label="별도 보증 준비금" value={formatKrw(finance.guaranteeReserveKrw)} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>조달 실행 순서</CardTitle>
            <CardDescription>비용과 상환 위험을 고려해 우선순위를 부여했습니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {finance.structure.length === 0 ? (
              <Alert variant="success">기본 시나리오에서 별도의 유동성 패키지가 필요하지 않습니다.</Alert>
            ) : (
              finance.structure.map((item) => (
                <div key={item.type} className="rounded-lg border border-border bg-muted/15 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-mono text-xs font-bold text-primary">{item.priority}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-foreground">{item.label}</h3>
                        <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                          {compactWon(item.amountKrw)}{" "}
                          <span className="text-xs font-normal text-muted-foreground">
                            ({item.type === "guarantee-reserve" ? "조달액 외 별도관리" : formatPct(item.sharePct)})
                          </span>
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.purpose}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
            <div className="grid gap-3 pt-1 md:grid-cols-2">
              <GuidanceList title="권고 근거" icon="target" items={finance.rationale} />
              <GuidanceList title="통제 조건" icon="lock" items={finance.safeguards} />
            </div>
            {finance.warnings.length > 0 && (
              <Alert variant="warning" title="실행 전 확인사항">
                <ul className="space-y-1">{finance.warnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul>
              </Alert>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-label="간편 스트레스 비교" className="mt-4">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>간편 스트레스 프리뷰</CardTitle>
              <CardDescription>원가 +10%, 회수 +30일, 금리 +2%p를 동시에 적용한 보수 시나리오입니다.</CardDescription>
            </div>
            <ActionLink href={`/scenario?contract=${encodeURIComponent(contract.id)}`} variant="ghost">직접 조정</ActionLink>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <ComparisonMetric label="위험점수" before={`${analysis.riskScore}점`} after={`${stress.riskScore}점`} adverse={stress.riskScore > analysis.riskScore} />
              <ComparisonMetric label="생존마진" before={formatPct(analysis.survivalMarginPct)} after={formatPct(stress.survivalMarginPct)} adverse={stress.survivalMarginPct < analysis.survivalMarginPct} />
              <ComparisonMetric label="자금 공백" before={compactWon(analysis.peakCashShortfallKrw)} after={compactWon(stress.peakCashShortfallKrw)} adverse={stress.peakCashShortfallKrw > analysis.peakCashShortfallKrw} />
              <ComparisonMetric label="현금 런웨이" before={analysis.cashRunwayLabel} after={stress.cashRunwayLabel} adverse={stress.cashRunwayMonths < analysis.cashRunwayMonths} />
              <ComparisonMetric label="필요 금융" before={compactWon(finance.fundingRequirementKrw)} after={compactWon(stress.financingRecommendation.fundingRequirementKrw)} adverse={stress.financingRecommendation.fundingRequirementKrw > finance.fundingRequirementKrw} />
            </div>
          </CardContent>
        </Card>
      </section>

      <section aria-label="계약 입력정보와 산정 가정" className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>계약·기업 입력정보</CardTitle>
            <CardDescription>분석에 사용된 원자료와 운영 가정입니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <Definition label="공고·계약번호" value={contract.procurementId} />
              <Definition label="발주처" value={contract.buyer} />
              <Definition label="지역" value={contract.region} />
              <Definition label="기초금액" value={formatKrw(contract.baseAmountKrw)} />
              <Definition label="계약금액" value={formatKrw(contract.contractAmountKrw)} />
              <Definition label="낙찰률" value={formatPct(contract.bidRatePct, 2)} />
              <Definition label="예상 총원가" value={formatKrw(contract.estimatedTotalCostKrw)} />
              <Definition label="가용현금" value={formatKrw(contract.availableCashKrw)} />
              <Definition label="월 영업현금유출" value={formatKrw(contract.monthlyOperatingCashOutflowKrw)} />
              <Definition label="기존 차입금" value={formatKrw(contract.existingBorrowingsKrw)} />
              <Definition label="월 부채상환" value={formatKrw(contract.monthlyDebtServiceKrw)} />
              <Definition label="연 이자율" value={formatPct(contract.annualInterestRatePct)} />
              <Definition label="수행기간" value={`${contract.durationMonths}개월`} />
              <Definition label="기본 회수지연" value={`${contract.paymentDelayDays}일`} />
              <Definition label="지급방식" value={paymentScheduleLabel[contract.paymentSchedule]} />
              <Definition label="선금률" value={formatPct(contract.advancePaymentRatePct)} />
              <Definition label="유보금률" value={formatPct(contract.retentionRatePct)} />
              <Definition label="계약보증률" value={formatPct(contract.guaranteeDepositRatePct)} />
              <Definition label="초기 원가 비중" value={formatPct(contract.upfrontCostRatePct)} />
              <Definition label="고정원가 비중" value={formatPct(contract.fixedCostRatePct)} />
            </dl>
            {contract.description && <p className="mt-5 border-t border-border pt-4 text-xs leading-6 text-muted-foreground">{contract.description}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>모델 가정과 한계</CardTitle>
            <CardDescription>결과 해석 시 반드시 함께 확인해야 합니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {analysis.assumptions.map((assumption, index) => (
                <li key={assumption} className="flex gap-3 text-xs leading-5 text-muted-foreground">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[10px] font-semibold text-foreground">{index + 1}</span>
                  <span>{assumption}</span>
                </li>
              ))}
            </ol>
            <Alert variant="info" className="mt-5" title="모델의 역할">
              위험 계약의 우선순위를 찾는 의사결정 지원도구입니다. 회계감사, 신용평가, 대출심사를 대체하지 않습니다.
            </Alert>
          </CardContent>
        </Card>
      </section>

      <Modal
        open={editorOpen}
        onOpenChange={(open) => (open ? setEditorOpen(true) : closeBaselineEditor())}
        title="기준 가정 편집"
        description="계약별 현금흐름과 위험점수의 기준 입력값을 수정합니다. 저장 즉시 모든 분석이 다시 계산됩니다."
        size="xl"
        footer={
          <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              variant="destructive"
              onClick={deleteContract}
              aria-label={`${contract.companyName} 계약 삭제`}
              leadingIcon={<Icon name="x" size={15} aria-hidden="true" />}
            >
              계약 삭제
            </Button>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={closeBaselineEditor}>취소</Button>
              <Button type="submit" form={editorFormId} leadingIcon={<Icon name="check" size={15} aria-hidden="true" />}>
                저장하고 재분석
              </Button>
            </div>
          </div>
        }
      >
        {baselineForm && (
          <form id={editorFormId} onSubmit={saveBaseline} noValidate>
            <Alert variant="info" title="사용자 추정치로 기록됩니다" className="mb-5">
              저장하면 외부 원천의 데이터 품질이 <strong>추정</strong>으로 변경됩니다. 합성 원천은 일부 값을 수정해도 <strong>합성</strong> 표시를 유지합니다.
            </Alert>

            {Object.keys(baselineErrors).length > 0 && (
              <Alert variant="destructive" title="입력값을 확인해 주세요" className="mb-5">
                표시된 {Object.keys(baselineErrors).length}개 항목을 수정한 뒤 다시 저장해 주세요.
              </Alert>
            )}

            <fieldset>
              <legend className="text-sm font-semibold text-foreground">원가·유동성</legend>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">원 단위 금액이며, 계약 실행 원가와 기업 공통 운영 유출을 분리해 입력합니다.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <BaselineNumberField
                  id={`${editorFormId}-estimated-cost`}
                  label="예상 총원가"
                  value={baselineForm.estimatedTotalCostKrw}
                  onChange={(value) => setBaselineValue("estimatedTotalCostKrw", value)}
                  error={baselineErrors.estimatedTotalCostKrw}
                  min={0}
                  max={Math.max(contract.contractAmountKrw * 3, 0)}
                  step={10_000}
                  unit="원"
                  help={`계약금액 대비 ${formatEditableRatio(baselineForm.estimatedTotalCostKrw, contract.contractAmountKrw)} · 계약 고유 실행원가만 입력`}
                />
                <BaselineNumberField
                  id={`${editorFormId}-cash`}
                  label="가용현금"
                  value={baselineForm.availableCashKrw}
                  onChange={(value) => setBaselineValue("availableCashKrw", value)}
                  error={baselineErrors.availableCashKrw}
                  min={0}
                  step={10_000}
                  unit="원"
                  help="계약 착수 시 실제 사용할 수 있는 현금성 자산"
                />
                <BaselineNumberField
                  id={`${editorFormId}-operating-outflow`}
                  label="월 영업현금유출"
                  value={baselineForm.monthlyOperatingCashOutflowKrw}
                  onChange={(value) => setBaselineValue("monthlyOperatingCashOutflowKrw", value)}
                  error={baselineErrors.monthlyOperatingCashOutflowKrw}
                  min={0}
                  step={10_000}
                  unit="원"
                  help="계약 원가와 별개인 급여·임차료 등 기업 공통 유출"
                />
                <BaselineNumberField
                  id={`${editorFormId}-upfront-cost`}
                  label="초기 원가 비중"
                  value={baselineForm.upfrontCostRatePct}
                  onChange={(value) => setBaselineValue("upfrontCostRatePct", value)}
                  error={baselineErrors.upfrontCostRatePct}
                  min={0}
                  max={100}
                  step={0.1}
                  unit="%"
                  help="예상 총원가 중 첫 달에 선투입되는 비중"
                />
                <BaselineNumberField
                  id={`${editorFormId}-fixed-cost`}
                  label="고정원가 비중"
                  value={baselineForm.fixedCostRatePct}
                  onChange={(value) => setBaselineValue("fixedCostRatePct", value)}
                  error={baselineErrors.fixedCostRatePct}
                  min={0}
                  max={100}
                  step={0.1}
                  unit="%"
                  help="물량 감소 시에도 줄지 않는 계약 원가 비중"
                />
              </div>
            </fieldset>

            <fieldset className="mt-7 border-t border-border pt-6">
              <legend className="text-sm font-semibold text-foreground">차입·수행 조건</legend>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <BaselineNumberField
                  id={`${editorFormId}-borrowings`}
                  label="기존 차입금"
                  value={baselineForm.existingBorrowingsKrw}
                  onChange={(value) => setBaselineValue("existingBorrowingsKrw", value)}
                  error={baselineErrors.existingBorrowingsKrw}
                  min={0}
                  step={10_000}
                  unit="원"
                  help="분석 시작 시점의 이자부 차입 원금 잔액"
                />
                <BaselineNumberField
                  id={`${editorFormId}-debt-service`}
                  label="월 예정 부채상환"
                  value={baselineForm.monthlyDebtServiceKrw}
                  onChange={(value) => setBaselineValue("monthlyDebtServiceKrw", value)}
                  error={baselineErrors.monthlyDebtServiceKrw}
                  min={0}
                  step={10_000}
                  unit="원"
                  help="이자를 제외한 월 예정 원금상환액"
                />
                <BaselineNumberField
                  id={`${editorFormId}-interest`}
                  label="연 이자율"
                  value={baselineForm.annualInterestRatePct}
                  onChange={(value) => setBaselineValue("annualInterestRatePct", value)}
                  error={baselineErrors.annualInterestRatePct}
                  min={0}
                  max={50}
                  step={0.1}
                  unit="%"
                  help="기존 차입금에 적용할 연 환산 금리"
                />
                <BaselineNumberField
                  id={`${editorFormId}-duration`}
                  label="수행기간"
                  value={baselineForm.durationMonths}
                  onChange={(value) => setBaselineValue("durationMonths", value)}
                  error={baselineErrors.durationMonths}
                  min={1}
                  max={120}
                  step={1}
                  unit="개월"
                  help="착수부터 계약상 완료까지의 정수 개월 수"
                />
              </div>
            </fieldset>

            <fieldset className="mt-7 border-t border-border pt-6">
              <legend className="text-sm font-semibold text-foreground">지급·보증 조건</legend>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor={`${editorFormId}-schedule`} className="text-xs font-semibold text-foreground">지급방식</label>
                  <Select
                    id={`${editorFormId}-schedule`}
                    value={baselineForm.paymentSchedule}
                    onChange={(event) => setBaselineValue("paymentSchedule", event.target.value)}
                    className="mt-2"
                  >
                    <option value="monthly">월별 기성</option>
                    <option value="milestone">단계별 지급</option>
                    <option value="completion">완료 후 일괄 지급</option>
                  </Select>
                  <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">계약대금이 현금으로 유입되는 기본 패턴</p>
                </div>
                <BaselineNumberField
                  id={`${editorFormId}-delay`}
                  label="기본 회수지연"
                  value={baselineForm.paymentDelayDays}
                  onChange={(value) => setBaselineValue("paymentDelayDays", value)}
                  error={baselineErrors.paymentDelayDays}
                  min={0}
                  max={730}
                  step={1}
                  unit="일"
                  help="청구·검수 이후 실제 입금까지 걸리는 정수 일수"
                />
                <BaselineNumberField
                  id={`${editorFormId}-advance`}
                  label="선금률"
                  value={baselineForm.advancePaymentRatePct}
                  onChange={(value) => setBaselineValue("advancePaymentRatePct", value)}
                  error={baselineErrors.advancePaymentRatePct}
                  min={0}
                  max={100}
                  step={0.1}
                  unit="%"
                  help="착수 시 계약금액 중 먼저 수령하는 비중"
                />
                <BaselineNumberField
                  id={`${editorFormId}-retention`}
                  label="유보금률"
                  value={baselineForm.retentionRatePct}
                  onChange={(value) => setBaselineValue("retentionRatePct", value)}
                  error={baselineErrors.retentionRatePct}
                  min={0}
                  max={30}
                  step={0.1}
                  unit="%"
                  help="하자·검수 완료까지 발주처가 유보하는 지급액 비중"
                />
                <BaselineNumberField
                  id={`${editorFormId}-guarantee`}
                  label="계약보증률"
                  value={baselineForm.guaranteeDepositRatePct}
                  onChange={(value) => setBaselineValue("guaranteeDepositRatePct", value)}
                  error={baselineErrors.guaranteeDepositRatePct}
                  min={0}
                  max={30}
                  step={0.1}
                  unit="%"
                  help="현금흐름에서 별도 준비금으로 묶이는 계약금액 비중"
                />
              </div>
            </fieldset>

            <div className="mt-7 border-t border-destructive/25 pt-5">
              <h3 className="text-xs font-semibold text-red-300">위험 영역</h3>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">계약 삭제는 하단의 ‘계약 삭제’를 누른 뒤 별도 확인을 거쳐야 실행됩니다.</p>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

function BaselineNumberField({
  id,
  label,
  value,
  onChange,
  error,
  min,
  max,
  step,
  unit,
  help,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  min?: number;
  max?: number;
  step?: number;
  unit: string;
  help: string;
}) {
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="text-xs font-semibold text-foreground">{label}</label>
      <div className="relative mt-2">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          min={min}
          max={max}
          step={step}
          invalid={Boolean(error)}
          aria-describedby={`${descriptionId}${error ? ` ${errorId}` : ""}`}
          className="pe-14 font-mono tabular-nums"
        />
        <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-muted-foreground">{unit}</span>
      </div>
      <p id={descriptionId} className="mt-1.5 text-[11px] leading-5 text-muted-foreground">{help}</p>
      {error && <p id={errorId} role="alert" className="mt-1 text-[11px] leading-5 text-red-300">{error}</p>}
    </div>
  );
}

function formatEditableRatio(value: string, contractAmountKrw: number): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || contractAmountKrw <= 0) return "원가율 계산 불가";
  return `원가율 ${formatPct((numeric / contractAmountKrw) * 100, 1)}`;
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/15 p-3">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-mono text-xs font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function MiniDefinition({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/25 p-3">
      <dt className="text-[10px] text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-all font-mono text-xs font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function Definition({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-b border-border/60 pb-3">
      <dt className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-xs font-medium leading-5 text-foreground">{value}</dd>
    </div>
  );
}

function GuidanceList({ title, icon, items }: { title: string; icon: "target" | "lock"; items: string[] }) {
  return (
    <div className="rounded-lg border border-border bg-muted/10 p-4">
      <h4 className="flex items-center gap-2 text-xs font-semibold text-foreground"><Icon name={icon} size={14} className="text-primary" />{title}</h4>
      {items.length > 0 ? (
        <ul className="mt-3 space-y-2 text-[11px] leading-5 text-muted-foreground">
          {items.map((item) => <li key={item} className="flex gap-2"><span className="text-primary">•</span><span>{item}</span></li>)}
        </ul>
      ) : <p className="mt-2 text-[11px] text-muted-foreground">추가 권고사항이 없습니다.</p>}
    </div>
  );
}

function ComparisonMetric({ label, before, after, adverse }: { label: string; before: string; after: string; adverse: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-muted/15 p-4">
      <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-center gap-2 font-mono text-xs font-semibold tabular-nums">
        <span className="text-muted-foreground">{before}</span>
        <Icon name="arrowRight" size={13} className="shrink-0 text-muted-foreground" />
        <span className={adverse ? "text-red-300" : "text-success"}>{after}</span>
      </div>
    </div>
  );
}
