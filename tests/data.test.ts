import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { describe, it } from "node:test";

// The app is bundled by Next.js and therefore uses extensionless local
// TypeScript imports. Mirror that resolution in Node's native test runner.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const {
  DataMergeError,
  KonepsError,
  buildKonepsRequestUrl,
  createContractRecordFromSources,
  createCompanyImportTemplate,
  normalizeProcurementQuery,
  parseCompanyFinancialCsv,
  searchKonepsProcurement,
} = await import("../src/lib/data/index.ts");

describe("KONEPS adapter", () => {
  it("uses Korean civil dates for the default search range on UTC servers", () => {
    const query = normalizeProcurementQuery({}, new Date("2026-07-12T15:30:00.000Z"));

    assert.equal(query.to, "2026-07-13");
    assert.equal(query.from, "2026-06-13");
  });

  it("builds an encoded URL with URLSearchParams", () => {
    const query = normalizeProcurementQuery({
      resources: ["notice"],
      kinds: ["service"],
      from: "2026-07-01",
      to: "2026-07-10",
      keyword: "AI 플랫폼",
      page: 2,
      pageSize: 30,
    });
    const url = buildKonepsRequestUrl("notice", "service", query, "abc+/decoded-key");

    assert.equal(url.protocol, "https:");
    assert.equal(url.pathname.endsWith("getBidPblancListInfoServcPPSSrch"), true);
    assert.equal(url.searchParams.get("serviceKey"), "abc+/decoded-key");
    assert.equal(url.searchParams.get("bidNtceNm"), "AI 플랫폼");
    assert.equal(url.searchParams.get("inqryBgnDt"), "202607010000");
    assert.equal(url.searchParams.get("inqryEndDt"), "202607102359");
    assert.equal(url.searchParams.get("pageNo"), "2");
  });

  it("normalizes a live JSON response without exposing the service key", async () => {
    let requestedUrl: URL | undefined;
    const fetchMock = (async (input: RequestInfo | URL) => {
      requestedUrl = new URL(input instanceof Request ? input.url : input.toString());
      return new Response(
        JSON.stringify({
          response: {
            header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
            body: {
              totalCount: 1,
              items: [
                {
                  bidNtceNo: "20260700001",
                  bidNtceOrd: "00",
                  bidNtceNm: "AI 기반 시설관리 용역",
                  ntceInsttNm: "테스트 발주기관",
                  dminsttNm: "테스트 수요기관",
                  bidNtceDt: "202607031230",
                  bidClseDt: "202607151700",
                  presmptPrce: "1,500,000,000",
                  bsisAmount: "1450000000",
                },
              ],
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const secret = "live-key+/123";
    const result = await searchKonepsProcurement(
      {
        resources: ["notice"],
        kinds: ["service"],
        keyword: "AI",
        from: "2026-07-01",
        to: "2026-07-10",
        allowDemoFallback: false,
      },
      { serviceKey: secret, fetchImpl: fetchMock },
    );

    assert.equal(requestedUrl?.searchParams.get("serviceKey"), secret);
    assert.equal(result.source, "live");
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].estimatedAmount, 1_500_000_000);
    assert.equal(result.items[0].publishedAt, "2026-07-03T12:30:00+09:00");
    assert.equal(JSON.stringify(result).includes(secret), false);
  });

  it("uses clearly labelled synthetic data when the service key is absent", async () => {
    let fetchCalled = false;
    const result = await searchKonepsProcurement(
      {
        resources: ["notice"],
        kinds: ["construction"],
        from: "2026-07-01",
        to: "2026-07-10",
      },
      {
        serviceKey: "",
        fetchImpl: (async () => {
          fetchCalled = true;
          throw new Error("should not be called");
        }) as typeof fetch,
      },
    );

    assert.equal(fetchCalled, false);
    assert.equal(result.source, "demo");
    assert.equal(result.items.length > 0, true);
    assert.equal(result.items.every((item) => item.isSynthetic && item.source === "demo"), true);
    assert.match(result.warnings.join(" "), /합성 데이터/);
  });

  it("normalizes a network failure and never leaks a key", async () => {
    const secret = "private-secret-key";
    await assert.rejects(
      searchKonepsProcurement(
        {
          resources: ["notice"],
          kinds: ["goods"],
          from: "2026-07-01",
          to: "2026-07-10",
          allowDemoFallback: false,
        },
        {
          serviceKey: secret,
          fetchImpl: (async () => {
            throw new Error(`request failed for serviceKey=${secret}`);
          }) as typeof fetch,
        },
      ),
      (error: unknown) => {
        assert.equal(error instanceof KonepsError, true);
        assert.equal(error instanceof Error && error.message.includes(secret), false);
        return true;
      },
    );
  });
});

describe("company CSV import", () => {
  it("parses Korean aliases, quoted commas, and numeric separators", () => {
    const csv = [
      "기업명,연매출,영업이익,현금및현금성자산,유동자산,유동부채,총부채,기준일",
      '"테스트, 주식회사","12,000,000,000",780000000,920000000,4600000000,3100000000,5200000000,20260630',
    ].join("\r\n");
    const result = parseCompanyFinancialCsv(csv);

    assert.equal(result.valid, true);
    assert.equal(result.summary.acceptedRows, 1);
    assert.equal(result.records[0].companyName, "테스트, 주식회사");
    assert.equal(result.records[0].annualRevenue, 12_000_000_000);
    assert.equal(result.records[0].asOfDate, "2026-06-30");
  });

  it("returns row-level issues while preserving valid rows", () => {
    const csv = [
      "company_name,annual_revenue,operating_profit,cash_and_equivalents,current_assets,current_liabilities,total_debt",
      "정상기업,1000000000,50000000,100000000,300000000,200000000,400000000",
      "오류기업,not-a-number,10,20,30,40,-1",
    ].join("\n");
    const result = parseCompanyFinancialCsv(csv);

    assert.equal(result.valid, false);
    assert.equal(result.summary.totalRows, 2);
    assert.equal(result.summary.acceptedRows, 1);
    assert.equal(result.summary.rejectedRows, 1);
    assert.equal(result.issues.some((entry) => entry.row === 3 && entry.code === "INVALID_NUMBER"), true);
    assert.equal(result.issues.some((entry) => entry.row === 3 && entry.code === "BELOW_MINIMUM"), true);
  });

  it("generates a UTF-8 BOM template that round-trips through validation", () => {
    const template = createCompanyImportTemplate();
    const result = parseCompanyFinancialCsv(template);

    assert.equal(template.startsWith("\uFEFF"), true);
    assert.equal(result.valid, true);
    assert.equal(result.summary.acceptedRows, 1);
    assert.equal(result.records[0].companyName, "BID-SHIELD 합성기업");
  });

  it("reports missing required headers before parsing rows", () => {
    const result = parseCompanyFinancialCsv("company_name,annual_revenue\n기업A,1000\n");

    assert.equal(result.valid, false);
    assert.equal(result.records.length, 0);
    assert.equal(result.issues.filter((entry) => entry.code === "MISSING_HEADER").length, 5);
  });
});

describe("data source merge", () => {
  it("promotes procurement and financial data with explicit analysis assumptions", () => {
    const company = parseCompanyFinancialCsv(createCompanyImportTemplate()).records[0];
    const procurement = {
      id: "award-1",
      resource: "award" as const,
      kind: "service" as const,
      source: "koneps-live" as const,
      isSynthetic: false,
      bidNoticeNo: "20260700001",
      bidNoticeOrder: "00",
      title: "데이터 플랫폼 구축",
      organization: "발주기관",
      demandOrganization: "수요기관",
      publishedAt: null,
      deadlineAt: null,
      openedAt: "2026-07-10T14:00:00+09:00",
      contractedAt: null,
      estimatedAmount: 1_000_000_000,
      baseAmount: 980_000_000,
      awardAmount: 870_000_000,
      awardRate: 88.78,
      winnerName: company.companyName,
      contractNumber: null,
      contractMethod: "협상에 의한 계약",
      referenceUrl: null,
    };
    const assumptions = {
      companySize: "small" as const,
      industryLabel: "정보통신",
      region: "서울특별시",
      estimatedCostRatePct: 84,
      monthlyOperatingCashOutflowKrw: 52_000_000,
      monthlyDebtServiceKrw: 8_000_000,
      annualInterestRatePct: 5.8,
      durationMonths: 10,
      paymentDelayDays: 45,
      advancePaymentRatePct: 20,
      retentionRatePct: 3,
      guaranteeDepositRatePct: 5,
      upfrontCostRatePct: 25,
      fixedCostRatePct: 55,
      paymentSchedule: "milestone" as const,
      companyDataQuality: "estimated" as const,
    };
    const contract = createContractRecordFromSources(procurement, company, assumptions);

    assert.equal(contract.procurementId, "20260700001-00");
    assert.equal(contract.contractAmountKrw, 870_000_000);
    assert.equal(contract.estimatedTotalCostKrw, 730_800_000);
    assert.equal(contract.availableCashKrw, company.cashAndEquivalents);
    assert.equal(contract.isSynthetic, false);
    assert.match(contract.description ?? "", /사용자 가정/);
    assert.throws(
      () => createContractRecordFromSources(procurement, company, { ...assumptions, annualInterestRatePct: 51 }),
      (error: unknown) => error instanceof DataMergeError && error.field === "annualInterestRatePct",
    );
    assert.throws(
      () => createContractRecordFromSources(procurement, company, { ...assumptions, guaranteeDepositRatePct: 31 }),
      (error: unknown) => error instanceof DataMergeError && error.field === "guaranteeDepositRatePct",
    );
  });
});
