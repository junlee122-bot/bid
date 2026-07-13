import {
  KonepsError,
  searchKonepsProcurement,
  type ProcurementApiResponse,
  type ProcurementKind,
  type ProcurementResource,
} from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESOURCE_ALIASES: Record<string, ProcurementResource | "all"> = {
  notice: "notice",
  notices: "notice",
  bid: "notice",
  bids: "notice",
  award: "award",
  awards: "award",
  contract: "contract",
  contracts: "contract",
  all: "all",
};

const KIND_ALIASES: Record<string, ProcurementKind | "all"> = {
  construction: "construction",
  works: "construction",
  service: "service",
  services: "service",
  goods: "goods",
  product: "goods",
  products: "goods",
  all: "all",
};

function splitParam(value: string | null): string[] {
  return value?.split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean) ?? [];
}

function parseResources(value: string | null): ProcurementResource[] | undefined {
  const values = splitParam(value);
  if (values.length === 0) return undefined;
  const mapped = values.map((entry) => RESOURCE_ALIASES[entry] ?? entry);
  return mapped.includes("all")
    ? ["notice", "award", "contract"]
    : (mapped as ProcurementResource[]);
}

function parseKinds(value: string | null): ProcurementKind[] | undefined {
  const values = splitParam(value);
  if (values.length === 0) return undefined;
  const mapped = values.map((entry) => KIND_ALIASES[entry] ?? entry);
  return mapped.includes("all")
    ? ["construction", "service", "goods"]
    : (mapped as ProcurementKind[]);
}

function parsePositiveInteger(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  return Number(value);
}

function parseFallback(value: string | null): boolean | undefined {
  if (value === null || value === "") return undefined;
  if (["true", "1", "yes"].includes(value.toLowerCase())) return true;
  if (["false", "0", "no"].includes(value.toLowerCase())) return false;
  throw new KonepsError("INVALID_QUERY", "fallback은 true 또는 false여야 합니다.", {
    status: 400,
  });
}

function json(body: ProcurementApiResponse, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const params = url.searchParams;

  try {
    const data = await searchKonepsProcurement({
      resources: parseResources(params.get("resource") ?? params.get("dataset")),
      kinds: parseKinds(params.get("kind")),
      keyword: params.get("keyword") ?? params.get("q") ?? undefined,
      bidNoticeNo: params.get("bidNoticeNo") ?? params.get("bidNo") ?? undefined,
      from: params.get("from") ?? params.get("startDate") ?? undefined,
      to: params.get("to") ?? params.get("endDate") ?? undefined,
      page: parsePositiveInteger(params.get("page")),
      pageSize: parsePositiveInteger(params.get("pageSize") ?? params.get("limit")),
      allowDemoFallback: parseFallback(params.get("fallback")),
    });
    return json({ ok: true, data });
  } catch (error) {
    if (error instanceof KonepsError) {
      return json(
        {
          ok: false,
          error: { code: error.code, message: error.message, retryable: error.retryable },
        },
        error.status,
      );
    }
    return json(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "조달 데이터를 처리하는 중 오류가 발생했습니다.",
          retryable: false,
        },
      },
      500,
    );
  }
}
