import { TextDecoder } from "node:util";
import { z } from "zod";
import { checkSearchRequestBudget, SEARCH_BODY_LIMIT_BYTES } from "@/lib/search/abuse-guard";
import { searchPassages } from "@/lib/search/service";
import { buildSuccessResponse } from "@/lib/utils/errors";
import { buildErrorResponse } from "@/lib/utils/errors";
import { RouteError } from "@/lib/utils/errors";

const SearchRequestSchema = z
  .object({
    query: z.string().trim().min(1).max(500),
    topK: z.number().int().min(1).max(10).optional(),
    threshold: z.number().min(0).max(1).optional(),
  })
  .strict();

function getClientKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "anonymous";
}

async function readBoundedText(request: Request): Promise<{ body: string; bodyBytes: number }> {
  const contentLength = request.headers.get("content-length");

  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);

    if (Number.isFinite(declaredBytes) && declaredBytes > SEARCH_BODY_LIMIT_BYTES) {
      throw new RouteError(413, "REQUEST_TOO_LARGE", "Search request body is too large.");
    }
  }

  if (!request.body) {
    return {
      body: "",
      bodyBytes: 0,
    };
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let bodyBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      bodyBytes += value.byteLength;

      if (bodyBytes > SEARCH_BODY_LIMIT_BYTES) {
        throw new RouteError(413, "REQUEST_TOO_LARGE", "Search request body is too large.");
      }

      body += decoder.decode(value, { stream: true });
    }

    body += decoder.decode();
  } catch (error) {
    if (error instanceof RouteError) {
      throw error;
    }

    throw new RouteError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  return {
    body,
    bodyBytes,
  };
}

async function parseBoundedJson(request: Request): Promise<unknown> {
  const { body, bodyBytes } = await readBoundedText(request);

  checkSearchRequestBudget({
    clientKey: getClientKey(request),
    bodyBytes,
  });

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new RouteError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = SearchRequestSchema.parse(await parseBoundedJson(request));
    const results = await searchPassages({
      query: payload.query,
      ...(payload.topK !== undefined ? { topK: payload.topK } : {}),
      ...(payload.threshold !== undefined ? { threshold: payload.threshold } : {}),
    });
    return buildSuccessResponse(results);
  } catch (error) {
    return buildErrorResponse(error);
  }
}
