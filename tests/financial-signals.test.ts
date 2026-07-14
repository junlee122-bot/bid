import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

import type {
  CompanyFinancialSnapshot,
  ContractDataProvenance,
  ContractRecord,
} from "../src/lib/domain.ts";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      return nextResolve(specifier + ".ts", context);
    }
    return nextResolve(specifier, context);
  },
});

const { analyzeContract, analyzePortfolio } =
  await import("../src/lib/analytics/index.ts");

const baseContract: ContractRecord = {
  id: "financial-signal-base",
  procurementId: "FIN-001",
  title: "기업 재무신호 검증 계약",
  companyName: "재무신호기업",
  companySize: "small",
  industry: "테스트",
  region: "서울",
  buyer: "테스트기관",
  awardedAt: "2026-07-01",
  contractAmountKrw: 100_000_000,
  baseAmountKrw: 110_000_000,
  bidRatePct: 90.9,
  estimatedTotalCostKrw: 85_000_000,
  availableCashKrw: 100_000_000,
  monthlyOperatingCashOutflowKrw: 1_000_000,
  existingBorrowingsKrw: 20_000_000,
  monthlyDebtServiceKrw: 500_000,
  annualInterestRatePct: 6,
  durationMonths: 6,
  paymentDelayDays: 30,
  advancePaymentRatePct: 10,
  retentionRatePct: 3,
  guaranteeDepositRatePct: 5,
  upfrontCostRatePct: 25,
  fixedCostRatePct: 40,
  paymentSchedule: "monthly",
  dataQuality: "estimated",
  isSynthetic: false,
};

const baseFinancials: CompanyFinancialSnapshot = {
  annualRevenueKrw: 500_000_000,
  operatingProfitKrw: 30_000_000,
  cashAndEquivalentsKrw: 100_000_000,
  currentAssetsKrw: 300_000_000,
  currentLiabilitiesKrw: 100_000_000,
  totalDebtKrw: 100_000_000,
  existingOrderBacklogKrw: 200_000_000,
  averageCollectionDays: 45,
  averagePaymentDays: 30,
};

function provenance(
  stableKey: string,
  financialOverrides: Partial<CompanyFinancialSnapshot> = {},
): ContractDataProvenance {
  return {
    company: {
      stableKey,
      source: "company-financial-csv",
      asOfDate: "2026-06-30",
      financials: { ...baseFinancials, ...financialOverrides },
    },
    procurement: {
      resource: "award",
      kind: "service",
      source: "koneps-live",
      referenceUrl: "https://example.invalid/procurement",
      winnerName: "재무신호기업",
      lifecycleStage: "awarded",
      bidderMatch: "matched",
    },
    fields: {},
    warnings: [],
  };
}

test("structured company financials produce inspectable signals and affect risk", () => {
  const strong = analyzeContract({
    ...baseContract,
    id: "financial-strong",
    provenance: provenance("company-strong", {
      currentAssetsKrw: 300_000_000,
      currentLiabilitiesKrw: 100_000_000,
    }),
  });
  const weak = analyzeContract({
    ...baseContract,
    id: "financial-weak",
    provenance: provenance("company-weak", {
      currentAssetsKrw: 80_000_000,
      currentLiabilitiesKrw: 100_000_000,
    }),
  });
  const strongDebt = strong.riskContributions.find((item) => item.id === "debt-burden");
  const weakDebt = weak.riskContributions.find((item) => item.id === "debt-burden");

  assert.equal(strong.corporateFinancialSignals?.currentRatioPct, 300);
  assert.equal(weak.corporateFinancialSignals?.currentRatioPct, 80);
  assert.equal(weak.corporateFinancialSignals?.netWorkingCapitalKrw, -20_000_000);
  assert.ok((weakDebt?.points ?? 0) > (strongDebt?.points ?? 0));
  assert.ok(weak.riskScore > strong.riskScore);
  assert.ok(weak.alerts.some((alert) => alert.includes("유동비율")));
});

test("portfolio reconciliation prefers stable company keys over matching names", () => {
  const first = {
    ...baseContract,
    id: "stable-key-one",
    companyName: "같은표기기업",
    contractAmountKrw: 0,
    baseAmountKrw: 0,
    estimatedTotalCostKrw: 0,
    existingBorrowingsKrw: 0,
    monthlyDebtServiceKrw: 0,
    guaranteeDepositRatePct: 0,
    advancePaymentRatePct: 0,
    provenance: provenance("stable-company-one"),
  };
  const sameCompanyDifferentName = {
    ...first,
    id: "stable-key-two",
    companyName: "같은 표기 기업 주식회사",
    provenance: provenance("stable-company-one"),
  };
  const sameNameDifferentCompany = {
    ...first,
    id: "stable-key-three",
    provenance: provenance("stable-company-two"),
  };

  const merged = analyzePortfolio([first, sameCompanyDifferentName]);
  const separated = analyzePortfolio([first, sameNameDifferentCompany]);

  assert.equal(merged.monthlyCashflow[0].endingCashBalanceKrw, 99_000_000);
  assert.equal(separated.monthlyCashflow[0].endingCashBalanceKrw, 198_000_000);
});

test("company-level funding requirement reconciles shared cash and overhead", () => {
  const first: ContractRecord = {
    ...baseContract,
    id: "company-funding-one",
    availableCashKrw: 0,
    advancePaymentRatePct: 0,
    paymentSchedule: "completion",
    provenance: provenance("funding-company"),
  };
  const second: ContractRecord = {
    ...first,
    id: "company-funding-two",
    procurementId: "FIN-002",
    title: "기업 재무신호 검증 두 번째 계약",
  };
  const portfolio = analyzePortfolio([first, second]);
  const companyFunding = portfolio.companyFundingRequirements[0];

  assert.equal(portfolio.companyFundingRequirements.length, 1);
  assert.equal(companyFunding.contractCount, 2);
  assert.equal(
    portfolio.totalFundingRequirementKrw,
    companyFunding.fundingRequirementKrw,
  );
  assert.ok(portfolio.totalFundingRequirementKrw > 0);
  assert.ok(
    portfolio.totalFundingRequirementKrw <=
      portfolio.conservativeContractFundingRequirementKrw,
  );
});
