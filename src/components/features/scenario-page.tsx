"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { ActionLink, RiskBadge, compactWon } from "@/components/features/contract-ui";
import { PageHeader } from "@/components/layout/page-header";
import { useWorkspace } from "@/components/providers/workspace-provider";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icons";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { defaultScenario } from "@/data/demo";
import { runScenario } from "@/lib/analytics";
import type { ContractAnalysis, ScenarioInputs } from "@/lib/domain";
import { formatCompactKrw, formatPct, riskMeta } from "@/lib/format";

const PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  description: string;
  values: ScenarioInputs;
}> = [
  {
    id: "baseline",
    label: "기준",
    description: "추가 충격 없음",
    values: { ...defaultScenario },
  },
  {
    id: "cost",
    label: "원가 압박",
    description: "원가 +12% · 금리 +1%p",
    values: {
      costInflationPct: 12,
      paymentDelayDays: 0,
      interestRateChangePctPoints: 1,
      orderVolumeChangePct: 0,
    },
  },
  {
    id: "delay",
    label: "회수 지연",
    description: "대금 +60일 · 금리 +2%p",
    values: {
      costInflationPct: 3,
      paymentDelayDays: 60,
      interestRateChangePctPoints: 2,
      orderVolumeChangePct: 0,
    },
  },
  {
    id: "combined",
    label: "복합 위기",
    description: "원가·지연·수주 동시 충격",
    values: {
      costInflationPct: 18,
      paymentDelayDays: 90,
      interestRateChangePctPoints: 3,
      orderVolumeChangePct: -20,
    },
  },
];

const SLIDERS: ReadonlyArray<{
  key: keyof ScenarioInputs;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
}> = [
  {
    key: "costInflationPct",
    label: "추가 원가 상승률",
    hint: "기준 예상원가에 적용되는 추가 상승률",
    min: 0,
    max: 40,
    step: 1,
    format: (value) => `+${value.toFixed(0)}%`,
  },
  {
    key: "paymentDelayDays",
    label: "대금 지급 지연",
    hint: "현재 계약 지급조건에 더해지는 지연일",
    min: 0,
    max: 120,
    step: 5,
    format: (value) => `+${value.toFixed(0)}일`,
  },
  {
    key: "interestRateChangePctPoints",
    label: "조달금리 변동",
    hint: "기존 차입금리 대비 변화 폭",
    min: -2,
    max: 8,
    step: 0.5,
    format: (value) => `${value > 0 ? "+" : ""}${value.toFixed(1)}%p`,
  },
  {
    key: "orderVolumeChangePct",
    label: "주문량 변동",
    hint: "매출과 변동원가에 반영되는 물량 변화",
    min: -40,
    max: 20,
    step: 5,
    format: (value) => `${value > 0 ? "+" : ""}${value.toFixed(0)}%`,
  },
];

function signed(value: number, suffix: string, digits = 0): string {
  const rounded = value.toFixed(digits);
  return `${value > 0 ? "+" : ""}${rounded}${suffix}`;
}

function signedCompactWon(value: number): string {
  if (Math.abs(value) < 1) return "변동 없음";
  return `${value > 0 ? "+" : "-"}${formatCompactKrw(Math.abs(value))}원`;
}

function ComparisonMetric({
  label,
  icon,
  baseline,
  stressed,
  delta,
  status,
}: {
  label: string;
  icon: IconName;
  baseline: string;
  stressed: string;
  delta: string;
  status: "better" | "worse" | "neutral";
}) {
  const statusClass = {
    better: "border-success/20 bg-success/8 text-success",
    worse: "border-destructive/20 bg-destructive/8 text-red-300",
    neutral: "border-border bg-muted text-muted-foreground",
  }[status];

  return (
    <Card className="min-w-0">
      <CardContent className="pt-5 sm:pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-2 truncate font-mono text-2xl font-semibold tracking-[-0.04em] text-foreground tabular-nums">
              {stressed}
            </p>
          </div>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
            <Icon name={icon} size={18} />
          </span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">기준 {baseline}</span>
          <span className={`inline-flex rounded-full border px-2 py-1 font-mono font-semibold tabular-nums ${statusClass}`}>
            {delta}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function getLinePoints(values: readonly number[], width: number, height: number, min: number, max: number): string {
  const paddingX = 12;
  const paddingY = 12;
  const range = max - min || 1;
  const denominator = Math.max(values.length - 1, 1);
  return values
    .map((value, index) => {
      const x = paddingX + (index / denominator) * (width - paddingX * 2);
      const y = paddingY + ((max - value) / range) * (height - paddingY * 2);
      return `${x},${y}`;
    })
    .join(" ");
}

function CashflowComparisonChart({ baseline, stressed }: { baseline: ContractAnalysis; stressed: ContractAnalysis }) {
  const baselineValues = baseline.monthlyCashflow.map((month) => month.endingCashBalanceKrw);
  const stressedValues = stressed.monthlyCashflow.map((month) => month.endingCashBalanceKrw);
  const allValues = [...baselineValues, ...stressedValues, 0];
  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues);
  const padding = Math.max((rawMax - rawMin) * 0.12, 1);
  const min = rawMin - padding;
  const max = rawMax + padding;
  const width = 720;
  const height = 220;
  const zeroY = 12 + ((max - 0) / (max - min || 1)) * (height - 24);
  const baselinePoints = getLinePoints(baselineValues, width, height, min, max);
  const stressedPoints = getLinePoints(stressedValues, width, height, min, max);

  return (
    <figure aria-labelledby="cashflow-chart-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p id="cashflow-chart-title" className="text-sm font-semibold text-foreground">12개월 월말 현금잔고</p>
          <p className="mt-1 text-xs text-muted-foreground">같은 축에서 기준값과 스트레스 적용 결과를 비교합니다.</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground" aria-hidden="true">
          <span className="inline-flex items-center gap-2"><span className="h-0.5 w-5 bg-muted-foreground" />기준</span>
          <span className="inline-flex items-center gap-2"><span className="h-0.5 w-5 bg-primary" />스트레스</span>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-background/35 p-3">
        <div className="mb-2 flex items-center justify-between font-mono text-[10px] text-muted-foreground tabular-nums">
          <span>{compactWon(max)}</span>
          <span>최고 잔고</span>
        </div>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`기준 시나리오 최소 잔고 ${compactWon(baseline.minimumCashBalanceKrw)}, 스트레스 시나리오 최소 잔고 ${compactWon(stressed.minimumCashBalanceKrw)}`}
          className="h-52 w-full overflow-visible"
        >
          <title>기준 및 스트레스 시나리오 월말 현금잔고 비교</title>
          <desc>1개월부터 12개월까지 두 시나리오의 월말 현금잔고를 선으로 비교합니다.</desc>
          {[0.25, 0.5, 0.75].map((ratio) => (
            <line
              key={ratio}
              x1="12"
              x2={width - 12}
              y1={12 + ratio * (height - 24)}
              y2={12 + ratio * (height - 24)}
              stroke="var(--border)"
              strokeDasharray="4 5"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {zeroY >= 12 && zeroY <= height - 12 && (
            <line
              x1="12"
              x2={width - 12}
              y1={zeroY}
              y2={zeroY}
              stroke="var(--destructive)"
              strokeDasharray="5 5"
              strokeOpacity="0.7"
              vectorEffect="non-scaling-stroke"
            />
          )}
          <polyline
            points={baselinePoints}
            fill="none"
            stroke="var(--muted-foreground)"
            strokeWidth="2"
            strokeDasharray="6 5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={stressedPoints}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="mt-1 grid grid-cols-3 font-mono text-[10px] text-muted-foreground tabular-nums">
          <span>1개월</span>
          <span className="text-center">6개월</span>
          <span className="text-right">12개월</span>
        </div>
      </div>
    </figure>
  );
}

function ScenarioEmptyState() {
  return (
    <>
      <PageHeader
        eyebrow="SCENARIO LAB"
        title="계약 스트레스 테스트"
        description="원가·대금 회수·금리·주문량 충격이 계약 생존성과 유동성에 미치는 영향을 비교합니다."
      />
      <Card>
        <CardContent className="flex min-h-80 flex-col items-center justify-center px-6 py-12 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground" aria-hidden="true">
            <Icon name="activity" size={24} />
          </span>
          <h2 className="mt-5 text-base font-semibold text-foreground">분석할 계약이 없습니다</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            데이터 허브에서 CSV를 불러오거나 공공조달 계약을 추가하면 즉시 스트레스 테스트를 실행할 수 있습니다.
          </p>
          <div className="mt-6">
            <ActionLink href="/data" variant="primary">데이터 허브로 이동</ActionLink>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

export function ScenarioPage({ initialContractId }: { initialContractId?: string }) {
  const router = useRouter();
  const { contracts } = useWorkspace();
  const [selectedId, setSelectedId] = useState(
    () => initialContractId?.trim() || contracts[0]?.id || "",
  );
  const [scenario, setScenario] = useState<ScenarioInputs>({ ...defaultScenario });
  const selectedContract = contracts.find((contract) => contract.id === selectedId) ?? contracts[0];
  const comparison = useMemo(
    () => (selectedContract ? runScenario(selectedContract, scenario) : null),
    [scenario, selectedContract],
  );

  if (!selectedContract || !comparison) return <ScenarioEmptyState />;

  const { baseline, stressed, delta } = comparison;
  const financing = stressed.financingRecommendation;
  const riskDeltaStatus = delta.riskScore > 0 ? "worse" : delta.riskScore < 0 ? "better" : "neutral";
  const marginDeltaStatus = delta.survivalMarginKrw < 0 ? "worse" : delta.survivalMarginKrw > 0 ? "better" : "neutral";
  const fundingDeltaStatus = delta.fundingRequirementKrw > 0 ? "worse" : delta.fundingRequirementKrw < 0 ? "better" : "neutral";
  const runwayDeltaStatus = delta.cashRunwayMonths < 0 ? "worse" : delta.cashRunwayMonths > 0 ? "better" : "neutral";
  const activePreset = PRESETS.find((preset) =>
    (Object.keys(preset.values) as Array<keyof ScenarioInputs>).every(
      (key) => preset.values[key] === scenario[key],
    ),
  )?.id;

  const updateScenario = (key: keyof ScenarioInputs, value: number) => {
    setScenario((current) => ({ ...current, [key]: value }));
  };

  const selectContract = (contractId: string) => {
    setSelectedId(contractId);
    router.replace(`/scenario?contract=${encodeURIComponent(contractId)}`, { scroll: false });
  };

  return (
    <>
      <PageHeader
        eyebrow="SCENARIO LAB"
        title="계약 스트레스 테스트"
        description="충격값을 바꾸면 12개월 현금흐름, 생존마진, 위험점수와 필요한 금융구조를 같은 기준으로 즉시 다시 계산합니다."
        actions={
          <Button
            variant="outline"
            size="sm"
            leadingIcon={<Icon name="refresh" size={15} />}
            onClick={() => setScenario({ ...defaultScenario })}
            disabled={activePreset === "baseline"}
          >
            기준값으로 초기화
          </Button>
        }
      />

      <section className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]" aria-label="분석 대상과 현재 결과">
        <Card>
          <CardContent className="pt-5 sm:pt-6">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <div>
                <label htmlFor="scenario-contract" className="mb-2 block text-xs font-medium text-muted-foreground">
                  분석 대상 계약
                </label>
                <Select
                  id="scenario-contract"
                  value={selectedContract.id}
                  onChange={(event) => selectContract(event.currentTarget.value)}
                  aria-describedby="scenario-contract-detail"
                >
                  {contracts.map((contract) => (
                    <option key={contract.id} value={contract.id}>
                      {contract.companyName} · {contract.title}
                    </option>
                  ))}
                </Select>
                <p id="scenario-contract-detail" className="mt-2 truncate text-xs text-muted-foreground">
                  {selectedContract.buyer} · 계약금액 {compactWon(selectedContract.contractAmountKrw)}
                </p>
              </div>
              <div className="flex items-center gap-2 md:pb-7">
                <RiskBadge level={stressed.riskLevel} score={stressed.riskScore} />
                <Badge variant={selectedContract.isSynthetic ? "neutral" : "success"}>
                  {selectedContract.isSynthetic ? "합성 입력" : "외부 입력"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex h-full items-center gap-4 pt-5 sm:pt-6">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary" aria-hidden="true">
              <Icon name="shield" size={20} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">스트레스 후 생존여력</p>
              <p className="mt-1 font-mono text-xl font-semibold text-foreground tabular-nums">
                {formatPct(stressed.remainingCostShockHeadroomPct)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">추가 원가 충격 허용 한계</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mb-6" aria-labelledby="preset-heading">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 id="preset-heading" className="text-sm font-semibold text-foreground">빠른 스트레스 프리셋</h2>
          <span className="text-xs text-muted-foreground">선택 후 세부값을 조정할 수 있습니다</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {PRESETS.map((preset) => {
            const selected = activePreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setScenario({ ...preset.values })}
                className={`rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  selected
                    ? "border-primary/50 bg-primary/10"
                    : "border-border bg-card hover:border-primary/30 hover:bg-muted/50"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">{preset.label}</span>
                  {selected && <Icon name="checkCircle" size={16} className="text-primary" aria-hidden="true" />}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">{preset.description}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <Card className="xl:sticky xl:top-24">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon name="settings" size={17} className="text-primary" />
              충격 조건
            </CardTitle>
            <CardDescription>기준 계약조건에 더해질 외부 충격을 설정하세요.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {SLIDERS.map((slider) => (
              <div key={slider.key}>
                <Slider
                  id={`scenario-${slider.key}`}
                  label={slider.label}
                  valueLabel={slider.format(scenario[slider.key])}
                  min={slider.min}
                  max={slider.max}
                  step={slider.step}
                  value={scenario[slider.key]}
                  onValueChange={(value) => updateScenario(slider.key, value)}
                  aria-describedby={`scenario-${slider.key}-hint`}
                />
                <p id={`scenario-${slider.key}-hint`} className="mt-1 text-[11px] leading-5 text-muted-foreground">
                  {slider.hint}
                </p>
              </div>
            ))}
            <div className="rounded-lg border border-border bg-muted/25 p-3 text-xs leading-5 text-muted-foreground">
              <div className="flex gap-2">
                <Icon name="info" size={15} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                <p>주문량은 매출과 변동원가에, 원가 상승은 전체 예상원가에 반영됩니다. 고정원가는 주문량 감소에도 유지됩니다.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-6">
          <p className="sr-only" aria-live="polite">
            스트레스 분석 결과 위험점수 {stressed.riskScore.toFixed(1)}점, 생존마진 {compactWon(stressed.survivalMarginKrw)}, 필요자금 {compactWon(financing.fundingRequirementKrw)}
          </p>
          <section className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4" aria-label="기준 대비 핵심 지표">
            <ComparisonMetric
              label="종합 위험점수"
              icon="shield"
              baseline={`${baseline.riskScore.toFixed(1)}점`}
              stressed={`${stressed.riskScore.toFixed(1)}점`}
              delta={signed(delta.riskScore, "점", 1)}
              status={riskDeltaStatus}
            />
            <ComparisonMetric
              label="계약 생존마진"
              icon="trendingUp"
              baseline={compactWon(baseline.survivalMarginKrw)}
              stressed={compactWon(stressed.survivalMarginKrw)}
              delta={signedCompactWon(delta.survivalMarginKrw)}
              status={marginDeltaStatus}
            />
            <ComparisonMetric
              label="필요 자금"
              icon="wallet"
              baseline={compactWon(baseline.financingRecommendation.fundingRequirementKrw)}
              stressed={compactWon(financing.fundingRequirementKrw)}
              delta={signedCompactWon(delta.fundingRequirementKrw)}
              status={fundingDeltaStatus}
            />
            <ComparisonMetric
              label="현금 런웨이"
              icon="clock"
              baseline={baseline.cashRunwayLabel}
              stressed={stressed.cashRunwayLabel}
              delta={delta.cashRunwayMonths === 0 ? "변동 없음" : signed(delta.cashRunwayMonths, "개월")}
              status={runwayDeltaStatus}
            />
          </section>

          <Card>
            <CardContent className="pt-5 sm:pt-6">
              <CashflowComparisonChart baseline={baseline} stressed={stressed} />
              <dl className="mt-5 grid gap-3 border-t border-border pt-5 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg bg-muted/30 p-3">
                  <dt className="text-xs text-muted-foreground">최저 현금잔고</dt>
                  <dd className={`mt-1 font-mono text-sm font-semibold tabular-nums ${stressed.minimumCashBalanceKrw < 0 ? "text-red-300" : "text-foreground"}`}>
                    {compactWon(stressed.minimumCashBalanceKrw)}
                  </dd>
                </div>
                <div className="rounded-lg bg-muted/30 p-3">
                  <dt className="text-xs text-muted-foreground">최대 자금 공백</dt>
                  <dd className="mt-1 font-mono text-sm font-semibold text-foreground tabular-nums">
                    {compactWon(stressed.peakCashShortfallKrw)}
                  </dd>
                </div>
                <div className="rounded-lg bg-muted/30 p-3">
                  <dt className="text-xs text-muted-foreground">기성 후 미회수액</dt>
                  <dd className="mt-1 font-mono text-sm font-semibold text-foreground tabular-nums">
                    {compactWon(stressed.remainingReceivablesAfter12mKrw)}
                  </dd>
                </div>
                <div className="rounded-lg bg-muted/30 p-3">
                  <dt className="text-xs text-muted-foreground">12개월 후 잔여 계약가액</dt>
                  <dd className="mt-1 font-mono text-sm font-semibold text-foreground tabular-nums">
                    {compactWon(stressed.remainingContractValueAfter12mKrw)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <section className="grid gap-6 2xl:grid-cols-2" aria-label="위험 요인과 조달 구조">
            <Card>
              <CardHeader>
                <CardTitle>리스크 요인 분해</CardTitle>
                <CardDescription>기준 대비 각 위험 요인이 종합점수에 기여한 정도입니다.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {stressed.riskContributions.map((factor) => {
                  const baselineFactor = baseline.riskContributions.find((item) => item.id === factor.id);
                  const factorDelta = factor.points - (baselineFactor?.points ?? 0);
                  const factorMeta = riskMeta[factor.severity];
                  return (
                    <div key={factor.id}>
                      <div className="mb-2 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground">{factor.label}</p>
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={factor.explanation}>{factor.displayValue}</p>
                        </div>
                        <span className={`shrink-0 font-mono text-xs font-semibold tabular-nums ${factorMeta.softClass}`}>
                          {factor.points.toFixed(1)} / {factor.maxPoints}
                          {Math.abs(factorDelta) >= 0.05 && ` (${signed(factorDelta, "", 1)})`}
                        </span>
                      </div>
                      <Progress
                        value={factor.points}
                        max={factor.maxPoints}
                        tone={factor.severity === "critical" ? "danger" : factor.severity === "high" ? "warning" : factor.severity === "low" ? "success" : "primary"}
                        size="sm"
                        aria-label={`${factor.label} ${factor.points.toFixed(1)}점`}
                      />
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>권고 유동성 패키지</CardTitle>
                    <CardDescription>현금 공백을 비용·부채 증가 순서로 보완합니다.</CardDescription>
                  </div>
                  <Badge variant={financing.coveragePct >= 100 ? "success" : "warning"}>
                    커버리지 {formatPct(financing.coveragePct, 0)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border bg-muted/25 p-3">
                    <p className="text-xs text-muted-foreground">신규 유동성 조달액</p>
                    <p className="mt-1 font-mono text-lg font-semibold text-foreground tabular-nums">{compactWon(financing.totalLiquidityPackageKrw)}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/25 p-3">
                    <p className="text-xs text-muted-foreground">예상 금융비용</p>
                    <p className="mt-1 font-mono text-lg font-semibold text-foreground tabular-nums">{compactWon(financing.expectedFinancingCostKrw)}</p>
                  </div>
                </div>
                {financing.structure.length > 0 ? (
                  <ol className="mt-5 space-y-3">
                    {financing.structure.map((item) => (
                      <li key={item.type} className="rounded-lg border border-border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 gap-3">
                            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[11px] font-semibold text-primary">
                              {item.priority}
                            </span>
                            <div className="min-w-0">
                              <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-foreground">
                                {item.label}
                                {item.type === "guarantee-reserve" && <Badge variant="outline">조달액 외 별도관리</Badge>}
                              </p>
                              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{item.purpose}</p>
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="font-mono text-xs font-semibold text-foreground tabular-nums">{compactWon(item.amountKrw)}</p>
                            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground tabular-nums">
                              {item.type === "guarantee-reserve" ? "별도 관리" : formatPct(item.sharePct)}
                            </p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="mt-5 rounded-lg border border-success/20 bg-success/8 p-4 text-sm text-emerald-100">
                    현재 조건에서는 추가 외부자금 조달이 필요하지 않습니다.
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="alerts-heading">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="alerts-heading" className="text-sm font-semibold text-foreground">검토 알림</h2>
              <span className="font-mono text-xs text-muted-foreground tabular-nums">{stressed.alerts.length + financing.warnings.length}건</span>
            </div>
            {stressed.alerts.length + financing.warnings.length > 0 ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {[...stressed.alerts, ...financing.warnings].map((message, index) => (
                  <Alert
                    key={`${message}-${index}`}
                    variant={message.includes("음수") || message.includes("심각") || message.includes("해소되지") ? "destructive" : "warning"}
                    title={index < stressed.alerts.length ? "분석 경고" : "실행 전 확인"}
                  >
                    {message}
                  </Alert>
                ))}
              </div>
            ) : (
              <Alert variant="success" title="중요 경고 없음">
                현재 스트레스 조건에서는 즉시 조치가 필요한 위험 신호가 감지되지 않았습니다.
              </Alert>
            )}
          </section>

          <Card>
            <CardHeader>
              <CardTitle>실행 안전장치</CardTitle>
              <CardDescription>권고 금융을 실제 업무에 적용하기 전에 함께 운영해야 할 통제입니다.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 lg:grid-cols-2">
              {financing.safeguards.map((item, index) => (
                <div key={item} className="flex gap-3 rounded-lg border border-border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-success/10 font-mono text-[10px] font-semibold text-success">{index + 1}</span>
                  <span>{item}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Alert variant="info" title="의사결정 보조용 시뮬레이션">
            이 결과는 입력값과 12개월 월별 지급 가정에 따른 추정치입니다. 실제 금융 실행 전 원가명세, 검수 일정, 채권양도 제한과 최신 재무정보를 반드시 확인하세요.
          </Alert>
        </div>
      </div>
    </>
  );
}
