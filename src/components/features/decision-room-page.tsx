"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyContracts, MetricCard, RiskBadge, compactWon } from "@/components/features/contract-ui";
import { PageHeader } from "@/components/layout/page-header";
import { useWorkspace } from "@/components/providers/workspace-provider";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DonutChart, HorizontalBarChart } from "@/components/ui/charts";
import { Icon } from "@/components/ui/icons";
import { Progress, type ProgressTone } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { defaultScenario } from "@/data/demo";
import { analyzeContract, analyzePortfolio } from "@/lib/analytics";
import {
  allocateWorkingCapital,
  type CapitalAllocationItem,
  type CapitalAllocationStatus,
  type CapitalEligibilityPolicy,
} from "@/lib/analytics/capital-allocation";
import {
  MONTE_CARLO_ENGINE_VERSION,
  simulateContractRisk,
  type MonteCarloSimulationResult,
} from "@/lib/analytics/monte-carlo";
import { assessWorkspaceDataQuality } from "@/lib/data";
import type { ContractRecord, RiskLevel } from "@/lib/domain";
import { downloadTextFile, formatPct, riskMeta } from "@/lib/format";

const MAX_SIMULATION_COHORT = 24;
const COST_STEPS = [0, 5, 10, 15, 20] as const;
const DELAY_STEPS = [0, 30, 60, 90, 120] as const;
const RISK_LEVELS: RiskLevel[] = ["low", "caution", "high", "critical"];

type ReviewBand = "monitor" | "conditional" | "redesign";

const reviewMeta: Record<
  ReviewBand,
  { label: string; variant: BadgeVariant; description: string }
> = {
  monitor: {
    label: "모니터링",
    variant: "success",
    description: "현재 범위에서는 정기 점검 중심",
  },
  conditional: {
    label: "조건 재검토",
    variant: "warning",
    description: "선금·지급일·원가 근거 보강 필요",
  },
  redesign: {
    label: "구조 재설계",
    variant: "danger",
    description: "자금조달 또는 계약조건 조정 전 확대 검토",
  },
};

const allocationMeta: Record<
  CapitalAllocationStatus,
  { label: string; variant: BadgeVariant; tone: ProgressTone }
> = {
  "not-required": { label: "추가자금 불필요", variant: "neutral", tone: "success" },
  "fully-funded": { label: "전액 배분", variant: "success", tone: "success" },
  "partially-funded": { label: "부분 배분", variant: "warning", tone: "warning" },
  unfunded: { label: "미배분", variant: "danger", tone: "danger" },
};

function compareForSimulation(left: ReturnType<typeof analyzeContract>, right: ReturnType<typeof analyzeContract>) {
  const leftRequirement = left.financingRecommendation.fundingRequirementKrw;
  const rightRequirement = right.financingRecommendation.fundingRequirementKrw;
  return (
    right.riskScore - left.riskScore ||
    rightRequirement - leftRequirement ||
    right.contractAmountKrw - left.contractAmountKrw ||
    left.contractId.localeCompare(right.contractId, "ko")
  );
}

function classifyReview(
  allocation: CapitalAllocationItem,
  simulation?: MonteCarloSimulationResult,
): ReviewBand {
  const shortfallProbability = simulation?.probabilities.cashShortfallPct ?? 0;
  const lossProbability = simulation?.probabilities.negativeSurvivalMarginPct ?? 0;

  if (
    lossProbability >= 50 ||
    shortfallProbability >= 80 ||
    (allocation.status === "unfunded" &&
      (allocation.riskLevel === "high" || allocation.riskLevel === "critical"))
  ) {
    return "redesign";
  }

  if (
    lossProbability >= 20 ||
    shortfallProbability >= 40 ||
    allocation.status === "partially-funded" ||
    allocation.status === "unfunded"
  ) {
    return "conditional";
  }

  return "monitor";
}

function heatmapClass(score: number): string {
  if (score >= 75) return "border-destructive/35 bg-destructive/18 text-red-200";
  if (score >= 50) return "border-warning/35 bg-warning/15 text-amber-100";
  if (score >= 25) return "border-primary/35 bg-primary/12 text-primary";
  return "border-success/30 bg-success/10 text-emerald-200";
}

function probabilityClass(value: number): string {
  if (value >= 70) return "text-red-300";
  if (value >= 35) return "text-warning";
  return "text-foreground";
}

function DecisionLogic() {
  const steps = [
    {
      number: "01",
      title: "분포로 불확실성 측정",
      text: "원가·지급지연·금리·물량 충격을 함께 표본화해 단일 예상값의 착시를 줄입니다.",
    },
    {
      number: "02",
      title: "P90 자금 방어선 확인",
      text: "시뮬레이션 90%가 넘지 않는 필요자금 수준과 생존마진 하방을 함께 봅니다.",
    },
    {
      number: "03",
      title: "제한 예산을 근거 있게 배분",
      text: "위험 긴급도·유동성 강도·런웨이·경제성을 점수화해 우선순위를 고정합니다.",
    },
  ];

  return (
    <Card className="print-avoid-break">
      <CardHeader>
        <CardTitle>의사결정 근거 사슬</CardTitle>
        <CardDescription>수치 생성부터 조치 순서까지 같은 입력으로 다시 계산할 수 있습니다.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        {steps.map((step) => (
          <div key={step.number} className="rounded-lg border border-border/75 bg-muted/20 p-4">
            <span className="font-mono text-[11px] font-bold tracking-[0.12em] text-primary">
              STEP {step.number}
            </span>
            <h3 className="mt-2 text-sm font-semibold text-foreground">{step.title}</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.text}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

type DecisionWorkspace = Pick<
  ReturnType<typeof useWorkspace>,
  "contracts" | "source" | "updatedAt"
>;

export function DecisionRoomPage() {
  const { contracts, source, updatedAt, hydrated } = useWorkspace();

  // Keep the expensive probability engine out of server rendering and the
  // pre-hydration pass. The persisted workspace is only authoritative after
  // WorkspaceProvider has reconciled local storage.
  if (!hydrated) {
    return (
      <>
        <PageHeader
          eyebrow="DECISION INTELLIGENCE"
          title="자금 의사결정실"
          description="저장된 워크스페이스를 확인하고 확률형 스트레스와 자금배분 모델을 준비하고 있습니다."
        />
        <Card className="min-h-72 animate-pulse" aria-label="의사결정 분석 불러오는 중">
          <CardContent className="flex min-h-72 items-center justify-center pt-6 text-sm text-muted-foreground">
            의사결정 근거를 계산하고 있습니다…
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <DecisionRoomContent
      contracts={contracts}
      source={source}
      updatedAt={updatedAt}
    />
  );
}

function DecisionRoomContent({ contracts, source, updatedAt }: DecisionWorkspace) {
  const [sampleCount, setSampleCount] = useState(500);
  const [uncertaintyMultiplier, setUncertaintyMultiplier] = useState(1);
  const [budgetRatePct, setBudgetRatePct] = useState(70);
  const [eligibilityPolicy, setEligibilityPolicy] =
    useState<CapitalEligibilityPolicy>("viable-only");
  const [matrixContractId, setMatrixContractId] = useState("");
  const [qualityAsOfDate] = useState(() => new Date().toISOString().slice(0, 10));

  const portfolio = useMemo(() => analyzePortfolio(contracts, defaultScenario), [contracts]);
  const dataQuality = useMemo(
    () => assessWorkspaceDataQuality(contracts, qualityAsOfDate),
    [contracts, qualityAsOfDate],
  );
  const contractById = useMemo(
    () => new Map(contracts.map((contract) => [contract.id, contract])),
    [contracts],
  );
  const simulationContracts = useMemo(
    () =>
      [...portfolio.contracts]
        .sort(compareForSimulation)
        .map((analysis) => contractById.get(analysis.contractId))
        .filter((contract): contract is ContractRecord => Boolean(contract))
        .slice(0, MAX_SIMULATION_COHORT),
    [contractById, portfolio.contracts],
  );
  const simulations = useMemo(
    () =>
      simulationContracts.map((contract) =>
        simulateContractRisk(contract, {
          sampleCount,
          seed: "BID-SHIELD-2026:" + contract.id,
          uncertaintyMultiplier,
        }),
      ),
    [sampleCount, simulationContracts, uncertaintyMultiplier],
  );
  const simulationById = useMemo(
    () => new Map(simulations.map((simulation) => [simulation.contractId, simulation])),
    [simulations],
  );

  const availableBudgetKrw = Math.round(
    portfolio.conservativeContractFundingRequirementKrw * (budgetRatePct / 100),
  );
  const allocationPlan = useMemo(
    () =>
      allocateWorkingCapital(portfolio.contracts, availableBudgetKrw, {
        eligibilityPolicy,
      }),
    [availableBudgetKrw, eligibilityPolicy, portfolio.contracts],
  );
  const actionableAllocations = useMemo(
    () =>
      allocationPlan.allocations
        .filter((item) => item.fundingRequirementKrw > 0)
        .sort((left, right) => (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER)),
    [allocationPlan.allocations],
  );

  const totalP90FundingKrw = simulations.reduce(
    (total, simulation) => total + simulation.fundingRequirementKrw.p90,
    0,
  );
  const averageShortfallProbability = simulations.length
    ? simulations.reduce(
        (total, simulation) => total + simulation.probabilities.cashShortfallPct,
        0,
      ) / simulations.length
    : 0;
  const highUncertaintyCount = simulations.filter(
    (simulation) =>
      simulation.probabilities.cashShortfallPct >= 70 ||
      simulation.probabilities.negativeSurvivalMarginPct >= 40,
  ).length;
  const reviewCounts = actionableAllocations.reduce(
    (counts, allocation) => {
      counts[classifyReview(allocation, simulationById.get(allocation.contractId))] += 1;
      return counts;
    },
    { monitor: 0, conditional: 0, redesign: 0 } as Record<ReviewBand, number>,
  );
  const riskDistribution = RISK_LEVELS.map((level) => ({
    label: riskMeta[level].label,
    value: simulations.length
      ? simulations.reduce(
          (total, simulation) =>
            total + simulation.riskDistribution[level].probabilityPct,
          0,
        ) / simulations.length
      : 0,
    color: riskMeta[level].color,
  }));
  const averageHighRiskProbability =
    (riskDistribution.find((item) => item.label === riskMeta.high.label)?.value ?? 0) +
    (riskDistribution.find((item) => item.label === riskMeta.critical.label)?.value ?? 0);
  const driverSensitivity = (simulations[0]?.driverSensitivity ?? [])
    .map((driver) => {
      const correlation = simulations.reduce(
        (total, simulation) =>
          total +
          (simulation.driverSensitivity.find((item) => item.driver === driver.driver)
            ?.correlationToFundingRequirement ?? 0),
        0,
      ) / Math.max(simulations.length, 1);
      return {
        label: driver.label,
        value: Math.abs(correlation) * 100,
        valueLabel: "r " + (correlation >= 0 ? "+" : "") + correlation.toFixed(2),
        color: correlation >= 0 ? "var(--warning)" : "var(--success)",
      };
    })
    .sort((left, right) => right.value - left.value);

  const selectedMatrixContract =
    contractById.get(matrixContractId) ?? simulationContracts[0] ?? contracts[0];
  const stressMatrix = useMemo(
    () =>
      selectedMatrixContract
        ? DELAY_STEPS.map((delayDays) =>
            COST_STEPS.map((costInflationPct) =>
              analyzeContract(selectedMatrixContract, {
                costInflationPct,
                paymentDelayDays: delayDays,
                interestRateChangePctPoints: 0,
                orderVolumeChangePct: 0,
              }),
            ),
          )
        : [],
    [selectedMatrixContract],
  );

  const exportDecisionReport = () => {
    const generatedAt = new Date().toISOString();
    const payload = {
      schema: "bid-shield-decision-report/v1",
      generatedAt,
      workspace: { source, updatedAt, contractCount: contracts.length },
      dataQuality,
      model: {
        decisionModelVersion: "2.0.0",
        monteCarloEngineVersion: MONTE_CARLO_ENGINE_VERSION,
        validationStatus: "scenario-only-unvalidated",
        calibrationVersion: null,
        dataSnapshotId: null,
        deterministic: true,
        sampleCount,
        uncertaintyMultiplier,
        seedPolicy: "BID-SHIELD-2026:{contractId}",
        interpretation:
          "입력 가정에 따른 시나리오 분포이며 부도확률, 대출 승인 또는 성과 보장을 뜻하지 않습니다.",
      },
      budget: { budgetRatePct, availableBudgetKrw, eligibilityPolicy },
      inputContracts: contracts,
      portfolio,
      allocationPlan,
      simulations,
    };
    downloadTextFile(
      "bid-shield-decision-" + generatedAt.slice(0, 10) + ".json",
      JSON.stringify(payload, null, 2),
      "application/json;charset=utf-8",
    );
  };

  if (contracts.length === 0) {
    return (
      <>
        <PageHeader
          eyebrow="DECISION INTELLIGENCE"
          title="자금 의사결정실"
          description="확률형 스트레스와 제한 예산 배분을 한 흐름으로 연결합니다."
        />
        <Card><EmptyContracts /></Card>
      </>
    );
  }

  return (
    <div className="decision-report">
      <PageHeader
        eyebrow="DECISION INTELLIGENCE · REPRODUCIBLE"
        title="자금 의사결정실"
        description="계약별 확률형 스트레스 분포를 P90 필요자금으로 바꾸고, 제한된 운전자금을 설명 가능한 우선순위에 따라 배분합니다."
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => window.print()}
              leadingIcon={<Icon name="fileText" size={15} />}
            >
              보고서 인쇄
            </Button>
            <Button
              type="button"
              onClick={exportDecisionReport}
              leadingIcon={<Icon name="download" size={15} />}
            >
              근거 JSON
            </Button>
          </div>
        }
      />

      <Alert
        variant={source === "demo" ? "warning" : "info"}
        title="확률은 입력 가정의 결과이며 자동 승인 기준이 아닙니다"
        className="mb-6 print-avoid-break"
      >
        동일 시드로 결과를 재현할 수 있지만 실제 발생 빈도를 학습한 부도확률은 아닙니다.
        {source === "demo" && " 현재 합성 데모 데이터이므로 제품 시연과 분석 절차 검증에만 사용하세요."}
      </Alert>

      <section aria-labelledby="decision-summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <h2 id="decision-summary" className="sr-only">의사결정 핵심 지표</h2>
        <MetricCard
          label="가용 운전자금"
          value={compactWon(availableBudgetKrw)}
          description={"계약별 보수 필요자금의 " + budgetRatePct + "%로 설정"}
          icon="wallet"
          tone="primary"
        />
        <MetricCard
          label="P90 필요자금"
          value={compactWon(totalP90FundingKrw)}
          description={"우선 분석 " + simulations.length + "개 계약의 하방 방어선"}
          icon="shield"
          tone={totalP90FundingKrw > availableBudgetKrw ? "warning" : "success"}
        />
        <MetricCard
          label="배분 후 잔여 공백"
          value={compactWon(allocationPlan.summary.remainingFundingGapKrw)}
          description={"기준 필요자금 커버리지 " + formatPct(allocationPlan.summary.coveragePct)}
          icon="scale"
          tone={allocationPlan.summary.remainingFundingGapKrw > 0 ? "danger" : "success"}
        />
        <MetricCard
          label="구조 재설계 대상"
          value={reviewCounts.redesign.toLocaleString("ko-KR") + "건"}
          description={"고불확실성 계약 " + highUncertaintyCount + "건 · 평균 현금부족 표본 " + formatPct(averageShortfallProbability)}
          icon="alertTriangle"
          tone={reviewCounts.redesign > 0 ? "danger" : "success"}
        />
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-[0.72fr_1.28fr]" aria-label="분석 설정과 확률 분포">
        <Card className="no-print">
          <CardHeader>
            <CardTitle>의사결정 가정</CardTitle>
            <CardDescription>값을 바꾸면 모든 확률·배분·분류가 즉시 같은 규칙으로 다시 계산됩니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Slider
              id="capital-budget"
              label="가용 예산 / 기준 필요자금"
              value={budgetRatePct}
              valueLabel={budgetRatePct + "% · " + compactWon(availableBudgetKrw)}
              min={0}
              max={150}
              step={5}
              onValueChange={setBudgetRatePct}
            />
            <label className="block text-xs font-medium text-muted-foreground" htmlFor="simulation-count">
              시뮬레이션 반복 수
              <Select
                id="simulation-count"
                className="mt-2"
                value={sampleCount}
                onChange={(event) => setSampleCount(Number(event.currentTarget.value))}
              >
                <option value={250}>250회 · 빠른 검토</option>
                <option value={500}>500회 · 표준</option>
                <option value={1000}>1,000회 · 정밀 검토</option>
              </Select>
            </label>
            <label className="block text-xs font-medium text-muted-foreground" htmlFor="uncertainty-range">
              불확실성 범위
              <Select
                id="uncertainty-range"
                className="mt-2"
                value={uncertaintyMultiplier}
                onChange={(event) => setUncertaintyMultiplier(Number(event.currentTarget.value))}
              >
                <option value={0.8}>좁게 · 0.8배</option>
                <option value={1}>표준 · 1.0배</option>
                <option value={1.35}>보수적 · 1.35배</option>
              </Select>
            </label>
            <label className="block text-xs font-medium text-muted-foreground" htmlFor="eligibility-policy">
              손실계약 배분 정책
              <Select
                id="eligibility-policy"
                className="mt-2"
                value={eligibilityPolicy}
                onChange={(event) =>
                  setEligibilityPolicy(event.currentTarget.value as CapitalEligibilityPolicy)
                }
              >
                <option value="viable-only">기본 보류 · 수동 검토</option>
                <option value="include-manual-review">명시 승인 · 배분 포함</option>
              </Select>
            </label>
            <div className="rounded-lg border border-primary/20 bg-primary/7 p-4 text-xs leading-5 text-muted-foreground">
              <p className="font-semibold text-foreground">재현성 레지스트리</p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt>엔진</dt><dd className="text-end font-mono text-foreground">MC v{MONTE_CARLO_ENGINE_VERSION}</dd>
                <dt>시드 정책</dt><dd className="truncate text-end font-mono text-foreground">계약 ID 고정</dd>
                <dt>분석 코호트</dt><dd className="text-end font-mono text-foreground">{simulations.length} / {contracts.length}건</dd>
                <dt>데이터 완전성</dt><dd className="text-end font-mono text-foreground">{dataQuality.completeness}%</dd>
                <dt>재무 최신성</dt><dd className="text-end font-mono text-foreground">{dataQuality.freshness}%</dd>
              </dl>
            </div>
          </CardContent>
        </Card>

        <Card className="print-avoid-break">
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>시뮬레이션 위험 분포</CardTitle>
              <CardDescription>계약별 {sampleCount.toLocaleString("ko-KR")}회 표본의 위험등급 구성비를 코호트 평균으로 표시합니다.</CardDescription>
            </div>
            <Badge variant={averageHighRiskProbability >= 50 ? "danger" : averageHighRiskProbability >= 25 ? "warning" : "success"}>
              주의 이상 {formatPct(averageHighRiskProbability)}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="grid items-center gap-6 md:grid-cols-[0.8fr_1.2fr]">
              <DonutChart
                data={riskDistribution}
                ariaLabel="시뮬레이션 위험등급 평균 분포"
                centerValue={formatPct(averageHighRiskProbability, 0)}
                centerLabel="주의 이상"
                className="mx-auto max-w-sm"
              />
              <div>
                <p className="mb-4 text-xs font-semibold text-foreground">필요자금 민감도 · Pearson r</p>
                <HorizontalBarChart
                  data={driverSensitivity}
                  max={100}
                  ariaLabel="시뮬레이션 충격 변수와 필요자금의 평균 상관 민감도"
                />
                <p className="mt-3 text-[11px] leading-5 text-muted-foreground">절대 상관이 클수록 필요자금 변동과 함께 움직인 표본이 많습니다. 상관은 인과효과를 의미하지 않습니다.</p>
              </div>
            </div>
            {contracts.length > MAX_SIMULATION_COHORT && (
              <p className="mt-4 rounded-lg border border-warning/20 bg-warning/8 p-3 text-xs leading-5 text-amber-100/80">
                화면 응답성을 위해 위험·필요자금 기준 상위 {MAX_SIMULATION_COHORT}건에 확률 시뮬레이션을 적용했습니다. 기준 자금배분은 전체 {contracts.length.toLocaleString("ko-KR")}건을 포함합니다.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]" aria-label="자금 배분과 모델 근거">
        <Card className="print-avoid-break">
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>자금 배분 워터폴</CardTitle>
              <CardDescription>가용 예산이 소진될 때까지 우선순위가 높은 계약부터 배분합니다.</CardDescription>
            </div>
            <Badge variant={allocationPlan.summary.atRiskCoveragePct >= 80 ? "success" : "warning"}>
              고위험 커버 {formatPct(allocationPlan.summary.atRiskCoveragePct)}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            {actionableAllocations.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                기준 시나리오에서 추가 운전자금이 필요한 계약이 없습니다.
              </div>
            ) : (
              actionableAllocations.slice(0, 6).map((allocation) => {
                const meta = allocationMeta[allocation.status];
                return (
                  <div key={allocation.contractId}>
                    <div className="mb-2 flex items-center gap-3">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 font-mono text-[11px] font-bold text-primary">
                        {allocation.rank ?? "보류"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-foreground">{allocation.companyName}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {allocation.unallocatedReasonCode === "manual-review-hold"
                            ? "음수 생존마진 · 수동 검토"
                            : "우선순위 " + allocation.priorityScore.toFixed(1) + "점"}
                        </span>
                      </span>
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    </div>
                    <Progress
                      value={allocation.allocatedKrw}
                      max={allocation.fundingRequirementKrw}
                      label="배분액"
                      valueLabel={compactWon(allocation.allocatedKrw) + " / " + compactWon(allocation.fundingRequirementKrw)}
                      tone={meta.tone}
                      size="sm"
                    />
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <DecisionLogic />
      </section>

      <section aria-labelledby="decision-queue-heading" className="mt-4">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle id="decision-queue-heading">계약별 의사결정 큐</CardTitle>
              <CardDescription>확률 하방·예산 배분·기준 위험을 함께 보고 다음 검토 작업을 정합니다.</CardDescription>
            </div>
            <div className="hidden gap-2 sm:flex">
              <Badge variant="danger">재설계 {reviewCounts.redesign}</Badge>
              <Badge variant="warning">조건 {reviewCounts.conditional}</Badge>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-1 sm:px-0 sm:pb-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="ps-5 sm:ps-6">순위 / 기업</TableHead>
                  <TableHead className="text-right">현금부족 표본비율</TableHead>
                  <TableHead className="text-right">P90 필요자금</TableHead>
                  <TableHead className="text-right">배분 / 잔여</TableHead>
                  <TableHead className="text-center">검토 분류</TableHead>
                  <TableHead aria-label="계약 상세" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {actionableAllocations.slice(0, 15).map((allocation) => {
                  const simulation = simulationById.get(allocation.contractId);
                  const review = classifyReview(allocation, simulation);
                  const reviewInfo = reviewMeta[review];
                  return (
                    <TableRow key={allocation.contractId}>
                      <TableCell className="max-w-[280px] ps-5 sm:ps-6">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs font-bold text-primary">{allocation.rank ?? "보류"}</span>
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-foreground">{allocation.companyName}</span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{allocation.contractTitle}</span>
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className={"text-right font-mono text-xs font-semibold tabular-nums " + probabilityClass(simulation?.probabilities.cashShortfallPct ?? 0)}>
                        {simulation ? formatPct(simulation.probabilities.cashShortfallPct) : "코호트 외"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums text-foreground">
                        {simulation ? compactWon(simulation.fundingRequirementKrw.p90) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="block font-mono text-xs font-semibold tabular-nums text-foreground">{compactWon(allocation.allocatedKrw)}</span>
                        <span className="mt-0.5 block font-mono text-[11px] tabular-nums text-muted-foreground">공백 {compactWon(allocation.remainingGapKrw)}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={reviewInfo.variant} title={reviewInfo.description}>{reviewInfo.label}</Badge>
                      </TableCell>
                      <TableCell className="pe-5 text-right sm:pe-6">
                        <Link
                          href={"/contracts/" + encodeURIComponent(allocation.contractId)}
                          aria-label={allocation.companyName + " 계약 상세"}
                          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
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

      <section aria-label="스트레스 전이 매트릭스" className="mt-4">
        <Card className="print-avoid-break">
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>스트레스 전이 매트릭스</CardTitle>
              <CardDescription>원가 상승과 추가 지급지연이 겹칠 때 위험점수가 어느 경계에서 이동하는지 확인합니다.</CardDescription>
            </div>
            <div className="no-print w-64 max-w-full">
              <label htmlFor="matrix-contract" className="sr-only">매트릭스 분석 계약</label>
              <Select
                id="matrix-contract"
                value={selectedMatrixContract?.id ?? ""}
                onChange={(event) => setMatrixContractId(event.currentTarget.value)}
              >
                {simulationContracts.map((contract) => (
                  <option key={contract.id} value={contract.id}>{contract.companyName}</option>
                ))}
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {selectedMatrixContract && (
                <>
                  <span className="text-sm font-semibold text-foreground">{selectedMatrixContract.companyName}</span>
                  <RiskBadge level={analyzeContract(selectedMatrixContract).riskLevel} score={analyzeContract(selectedMatrixContract).riskScore} />
                  <span className="text-xs text-muted-foreground">{selectedMatrixContract.title}</span>
                </>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-separate border-spacing-2 text-center text-xs">
                <caption className="sr-only">행은 추가 지급지연 일수, 열은 원가 상승률이며 각 셀은 위험점수입니다.</caption>
                <thead>
                  <tr>
                    <th scope="col" className="px-2 py-2 text-start font-semibold text-muted-foreground">지연 ＼ 원가</th>
                    {COST_STEPS.map((cost) => (
                      <th key={cost} scope="col" className="px-2 py-2 font-mono font-semibold text-muted-foreground">+{cost}%</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DELAY_STEPS.map((delay, rowIndex) => (
                    <tr key={delay}>
                      <th scope="row" className="px-2 py-2 text-start font-mono font-semibold text-muted-foreground">+{delay}일</th>
                      {stressMatrix[rowIndex]?.map((analysis, columnIndex) => (
                        <td key={COST_STEPS[columnIndex]} className="p-0">
                          <div
                            className={"rounded-lg border px-3 py-3 font-mono font-bold tabular-nums " + heatmapClass(analysis.riskScore)}
                            title={"필요자금 " + compactWon(analysis.financingRecommendation.fundingRequirementKrw) + " · 생존마진 " + formatPct(analysis.survivalMarginPct)}
                          >
                            {analysis.riskScore.toFixed(0)}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">셀 숫자는 0~100 위험점수입니다. 다른 변수는 기준값으로 고정하며, 색상 경계는 안정 0~24 · 관찰 25~49 · 주의 50~74 · 위험 75~100입니다.</p>
          </CardContent>
        </Card>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-3" aria-label="모델 한계와 운영 확인">
        <Card className="print-avoid-break">
          <CardHeader><CardTitle>모델 유효 범위</CardTitle></CardHeader>
          <CardContent className="text-xs leading-6 text-muted-foreground">
            12개월 유동성 계획과 계약 조건 협상용 스트레스 도구입니다. 실제 부도 관측치로 보정된 확률모형이나 대출 심사모형이 아닙니다.
          </CardContent>
        </Card>
        <Card className="print-avoid-break">
          <CardHeader><CardTitle>데이터 검증 게이트</CardTitle></CardHeader>
          <CardContent className="text-xs leading-6 text-muted-foreground">
            실행 전 계약서의 지급·유보·보증 조건, 최신 원가명세, 가용현금, 차입 상환일을 원자료와 대조해야 합니다.
          </CardContent>
        </Card>
        <Card className="print-avoid-break">
          <CardHeader><CardTitle>사람의 최종 판단</CardTitle></CardHeader>
          <CardContent className="text-xs leading-6 text-muted-foreground">
            검토 분류는 업무 큐를 정리하는 신호입니다. 승인·거절·한도 결정은 담당자의 증빙 확인과 기관별 정책을 거쳐야 합니다.
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
