import {
  COMPANY_IMPORT_SCHEMA,
  IMPORT_MAX_BYTES,
  createCompanyImportTemplate,
  parseCompanyFinancialCsv,
  type ApiErrorBody,
  type ImportApiSuccess,
} from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ImportApiResponse = ImportApiSuccess | ApiErrorBody;

class ImportRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ImportRequestError";
  }
}

function errorResponse(code: string, message: string, status: number): Response {
  const body: ApiErrorBody = { ok: false, error: { code, message, retryable: false } };
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function decodeCsv(bytes: Uint8Array): { csv: string; encoding: "utf-8" | "euc-kr" } {
  try {
    return { csv: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" };
  } catch {
    try {
      return { csv: new TextDecoder("euc-kr", { fatal: true }).decode(bytes), encoding: "euc-kr" };
    } catch {
      throw new ImportRequestError(
        "UNSUPPORTED_ENCODING",
        "CSV 문자 인코딩을 읽을 수 없습니다. UTF-8 또는 CP949로 저장해 주세요.",
        400,
      );
    }
  }
}

function ensureSize(size: number): void {
  if (size > IMPORT_MAX_BYTES) {
    throw new ImportRequestError(
      "FILE_TOO_LARGE",
      `CSV는 ${IMPORT_MAX_BYTES / 1024 / 1024}MB 이하여야 합니다.`,
      413,
    );
  }
}

async function readCsvRequest(
  request: Request,
): Promise<{ csv: string; encoding: "utf-8" | "euc-kr" | "json-string" }> {
  const declaredSize = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredSize) && declaredSize > 0) ensureSize(declaredSize);
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file") ?? formData.get("csv");
    if (!(file instanceof File)) {
      throw new ImportRequestError("MISSING_FILE", "file 필드에 CSV 파일을 첨부해 주세요.", 400);
    }
    ensureSize(file.size);
    return decodeCsv(new Uint8Array(await file.arrayBuffer()));
  }

  if (contentType.includes("application/json")) {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      throw new ImportRequestError("INVALID_JSON", "JSON 요청 본문을 읽을 수 없습니다.", 400);
    }
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("csv" in payload) ||
      typeof (payload as { csv?: unknown }).csv !== "string"
    ) {
      throw new ImportRequestError("MISSING_CSV", "JSON 본문에 csv 문자열이 필요합니다.", 400);
    }
    const csv = (payload as { csv: string }).csv;
    ensureSize(new TextEncoder().encode(csv).byteLength);
    return { csv, encoding: "json-string" };
  }

  if (
    contentType.includes("text/csv") ||
    contentType.includes("application/csv") ||
    contentType.includes("text/plain") ||
    contentType === ""
  ) {
    const bytes = new Uint8Array(await request.arrayBuffer());
    ensureSize(bytes.byteLength);
    return decodeCsv(bytes);
  }

  throw new ImportRequestError(
    "UNSUPPORTED_MEDIA_TYPE",
    "text/csv, multipart/form-data 또는 application/json 형식을 사용해 주세요.",
    415,
  );
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.searchParams.get("format") === "json") {
    return Response.json(
      {
        ok: true,
        data: {
          maxBytes: IMPORT_MAX_BYTES,
          fields: COMPANY_IMPORT_SCHEMA,
          templateUrl: "/api/import",
        },
      },
      {
        headers: {
          "Cache-Control": "public, max-age=3600",
          "Content-Type": "application/json; charset=utf-8",
        },
      },
    );
  }

  return new Response(createCompanyImportTemplate(), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="bid-shield-company-template.csv"',
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const { csv, encoding } = await readCsvRequest(request);
    const body: ImportApiResponse = {
      ok: true,
      data: parseCompanyFinancialCsv(csv),
      meta: { encoding, importedAt: new Date().toISOString() },
    };
    return Response.json(body, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof ImportRequestError) {
      return errorResponse(error.code, error.message, error.status);
    }
    return errorResponse("IMPORT_FAILED", "CSV를 처리하는 중 오류가 발생했습니다.", 500);
  }
}
