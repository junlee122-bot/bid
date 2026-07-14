import type {
  ContractAnalysis,
  ContractRecord,
  PortfolioAnalysis,
  PortfolioConcentration,
  PortfolioCompanyFunding,
  RiskLevel,
  ScenarioInputs,
} from "../domain";
import { analyzeContract, getRiskLabel, getRiskLevel, sanitizeScenario, ZERO_SCENARIO } from "./analysis";
import { nonNegative, round, safeDivide, sum } from "./math";

function buildConcentration(
  contracts: ContractRecord[],
  field: "buyer" | "industry",
): PortfolioConcentration[] {
  const total = sum(contracts.map((contract) => nonNegative(contract.contractAmountKrw)));
  const groups = new Map<string, { amountKrw: number; contractCount: number }>();
  for (const contract of contracts) {
    const name = contract[field] || "미분류";
    const current = groups.get(name) ?? { amountKrw: 0, contractCount: 0 };
    current.amountKrw += nonNegative(contract.contractAmountKrw);
    current.contractCount += 1;
    groups.set(name, current);
  }

  return [...groups.entries()]
    .map(([name, group]) => ({
      name,
      amountKrw: round(group.amountKrw),
      sharePct: round(safeDivide(group.amountKrw, total) * 100, 1),
      contractCount: group.contractCount,
    }))
    .sort((a, b) => b.amountKrw - a.amountKrw || a.name.localeCompare(b.name, "ko"));
}

function getCompanyKey(contract: ContractRecord, index: number): string {
  const stableCompanyKey = contract.provenance?.company.stableKey.trim();
  if (stableCompanyKey) return "__company-key:" + stableCompanyKey;
  const companyName = contract.companyName.trim();
  if (companyName) return "__company-name:" + companyName.toLocaleLowerCase("ko-KR");
  return "__unknown-company:" + (contract.id || "contract") + ":" + index;
}

function buildCompanyFundingRequirements(
  contracts: readonly ContractRecord[],
  analyses: readonly ContractAnalysis[],
): PortfolioCompanyFunding[] {
  const groups = new Map<
    string,
    {
      companyName: string;
      indexes: number[];
      openingCashKrw: number;
      monthlyCorporateOutflowKrw: number;
      projectedCostKrw: number;
    }
  >();

  analyses.forEach((analysis, index) => {
    const contract = contracts[index];
    const key = getCompanyKey(contract, index);
    const firstMonth = analysis.monthlyCashflow[0];
    const corporateOutflow =
      firstMonth.operatingOutflowsKrw +
      firstMonth.debtServiceKrw +
      firstMonth.borrowingInterestKrw;
    const current = groups.get(key);
    groups.set(key, {
      companyName: current?.companyName ?? (contract.companyName || "기업명 미입력"),
      indexes: [...(current?.indexes ?? []), index],
      openingCashKrw: current
        ? Math.min(current.openingCashKrw, nonNegative(contract.availableCashKrw))
        : nonNegative(contract.availableCashKrw),
      monthlyCorporateOutflowKrw: current
        ? Math.max(current.monthlyCorporateOutflowKrw, corporateOutflow)
        : corporateOutflow,
      projectedCostKrw: (current?.projectedCostKrw ?? 0) + analysis.projectedCostKrw,
    });
  });

  return [...groups.entries()]
    .map(([companyKey, group]) => {
      let endingCash = group.openingCashKrw;
      let minimumCash = endingCash;
      for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
        const monthly = group.indexes.map(
          (analysisIndex) => analyses[analysisIndex].monthlyCashflow[monthIndex],
        );
        const inflows = sum(
          monthly.map(
            (cashflow) =>
              cashflow.contractInflowsKrw + nonNegative(cashflow.guaranteeMovementKrw),
          ),
        );
        const projectOutflows = sum(
          monthly.map(
            (cashflow) =>
              cashflow.contractCostsKrw + nonNegative(-cashflow.guaranteeMovementKrw),
          ),
        );
        endingCash += inflows - projectOutflows - group.monthlyCorporateOutflowKrw;
        minimumCash = Math.min(minimumCash, endingCash);
      }
      const liquidityBuffer = Math.max(
        group.monthlyCorporateOutflowKrw,
        group.projectedCostKrw * 0.03,
      );
      return {
        companyKey,
        companyName: group.companyName,
        contractCount: group.indexes.length,
        minimumCashBalanceKrw: round(minimumCash),
        liquidityBufferKrw: round(liquidityBuffer),
        fundingRequirementKrw: round(nonNegative(liquidityBuffer - minimumCash)),
      };
    })
    .sort(
      (left, right) =>
        right.fundingRequirementKrw - left.fundingRequirementKrw ||
        left.companyKey.localeCompare(right.companyKey, "ko"),
    );
}

export function analyzePortfolio(
  contracts: ContractRecord[],
  rawScenario: Partial<ScenarioInputs> = ZERO_SCENARIO,
): PortfolioAnalysis {
  const scenario = sanitizeScenario(rawScenario);
  const analyses = contracts.map((contract) => analyzeContract(contract, scenario));
  const totalContractAmount = sum(contracts.map((contract) => nonNegative(contract.contractAmountKrw)));
  const totalAdjustedRevenue = sum(analyses.map((analysis) => analysis.adjustedRevenueKrw));
  const totalProjectedCost = sum(analyses.map((analysis) => analysis.projectedCostKrw));
  const totalSurvivalMargin = sum(analyses.map((analysis) => analysis.survivalMarginKrw));
  const conservativeContractFundingRequirement = sum(
    analyses.map((analysis) => analysis.financingRecommendation.fundingRequirementKrw),
  );
  const companyFundingRequirements = buildCompanyFundingRequirements(contracts, analyses);
  const totalFundingRequirement = sum(
    companyFundingRequirements.map((company) => company.fundingRequirementKrw),
  );
  const weightedRiskScore = totalAdjustedRevenue > 0
    ? safeDivide(
        sum(analyses.map((analysis) => analysis.riskScore * analysis.adjustedRevenueKrw)),
        totalAdjustedRevenue,
      )
    : analyses.length > 0
      ? safeDivide(sum(analyses.map((analysis) => analysis.riskScore)), analyses.length)
      : 0;
  const riskLevel = getRiskLevel(weightedRiskScore);
  const riskDistribution: Record<RiskLevel, number> = {
    low: 0,
    caution: 0,
    high: 0,
    critical: 0,
  };
  for (const analysis of analyses) riskDistribution[analysis.riskLevel] += 1;

  // Company balance-sheet inputs are repeated on every ContractRecord. Group
  // them before aggregating so a company with multiple awards does not appear
  // to own the same cash or pay the same overhead several times.
  const companies = new Map<
    string,
    { openingCashKrw: number; monthlyCorporateOutflowKrw: number }
  >();
  analyses.forEach((analysis, index) => {
    const contract = contracts[index];
    const key = getCompanyKey(contract, index);
    const openingCash = nonNegative(contract.availableCashKrw);
    const firstMonth = analysis.monthlyCashflow[0];
    const corporateOutflow =
      firstMonth.operatingOutflowsKrw +
      firstMonth.debtServiceKrw +
      firstMonth.borrowingInterestKrw;
    const current = companies.get(key);
    companies.set(key, {
      // Conflicting snapshots are not silently averaged: use the lower cash
      // and the higher committed outflow as a conservative reconciliation.
      openingCashKrw: current ? Math.min(current.openingCashKrw, openingCash) : openingCash,
      monthlyCorporateOutflowKrw: current
        ? Math.max(current.monthlyCorporateOutflowKrw, corporateOutflow)
        : corporateOutflow,
    });
  });
  let portfolioEndingCash = sum([...companies.values()].map((company) => company.openingCashKrw));
  const monthlyCorporateOutflow = sum(
    [...companies.values()].map((company) => company.monthlyCorporateOutflowKrw),
  );

  const monthlyCashflow = Array.from({ length: 12 }, (_, index) => {
    const monthly = analyses.map((analysis) => analysis.monthlyCashflow[index]);
    const inflows = sum(
      monthly.map(
        (cashflow) => cashflow.contractInflowsKrw + nonNegative(cashflow.guaranteeMovementKrw),
      ),
    );
    const outflows =
      sum(
        monthly.map(
          (cashflow) =>
            cashflow.contractCostsKrw + nonNegative(-cashflow.guaranteeMovementKrw),
        ),
      ) + monthlyCorporateOutflow;
    portfolioEndingCash += inflows - outflows;
    return {
      month: index + 1,
      label: `${index + 1}개월`,
      inflowsKrw: round(inflows),
      outflowsKrw: round(outflows),
      netCashflowKrw: round(inflows - outflows),
      endingCashBalanceKrw: round(portfolioEndingCash),
    };
  });

  return {
    scenario,
    contracts: analyses,
    contractCount: analyses.length,
    totalContractAmountKrw: round(totalContractAmount),
    totalAdjustedRevenueKrw: round(totalAdjustedRevenue),
    totalProjectedCostKrw: round(totalProjectedCost),
    totalSurvivalMarginKrw: round(totalSurvivalMargin),
    totalFundingRequirementKrw: round(totalFundingRequirement),
    conservativeContractFundingRequirementKrw: round(
      conservativeContractFundingRequirement,
    ),
    companyFundingRequirements,
    weightedRiskScore: round(weightedRiskScore, 1),
    riskLevel,
    riskLabel: getRiskLabel(riskLevel),
    riskDistribution,
    monthlyCashflow,
    buyerConcentration: buildConcentration(contracts, "buyer"),
    industryConcentration: buildConcentration(contracts, "industry"),
    topRiskContracts: [...analyses]
      .sort((a, b) => b.riskScore - a.riskScore || b.peakCashShortfallKrw - a.peakCashShortfallKrw)
      .slice(0, 5),
    assumptions: [
      "포트폴리오 위험점수는 조정 계약매출액 가중평균입니다.",
      "포트폴리오 필요자금은 안정 기업키별로 공유 현금·고정유출을 한 번만 반영한 12개월 최저현금과 유동성 버퍼의 차이를 합산합니다.",
      "계약별 독립 필요자금 합계도 보수 상한으로 별도 보존하며 계약 배분 우선순위에 사용합니다.",
      "동일 기업키 계약은 기업 보유현금과 월 고정유출을 한 번만 반영합니다. 이전 형식은 기업명으로 대체 결합하며 값이 충돌하면 낮은 현금·높은 유출을 사용합니다.",
      "집중도는 원 계약금액 기준이며 동일 발주처·업종 명칭을 단순 합산합니다.",
    ],
  };
}
