import { TextDecoder } from "node:util";
import { z } from "zod";
import {
  checkAnnotateRequestBudget,
  ANNOTATE_BODY_LIMIT_BYTES,
} from "@/lib/annotation/abuse-guard";
import { createAnnotation } from "@/lib/annotation/service";
import { buildSuccessResponse } from "@/lib/utils/errors";
import { buildErrorResponse } from "@/lib/utils/errors";
import { RouteError } from "@/lib/utils/errors";

const AnnotateRequestSchema = z
  .object({
    query: z.string().trim().min(1).max(500),
    passageId: z.string().trim().min(1),
    passageText: z.string().trim().min(1).max(2000),
    style: z.enum(["academic", "classical", "modern", "poetic"]).optional(),
    visitedPassageIds: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  })
  .strict();

function getClientKey(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "anonymous"
  );
}

async function readBoundedText(request: Request): Promise<{ body: string; bodyBytes: number }> {
  const contentLength = request.headers.get("content-length");

  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);

    if (Number.isFinite(declaredBytes) && declaredBytes > ANNOTATE_BODY_LIMIT_BYTES) {
      throw new RouteError(413, "REQUEST_TOO_LARGE", "Annotate request body is too large.");
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

      if (bodyBytes > ANNOTATE_BODY_LIMIT_BYTES) {
        throw new RouteError(413, "REQUEST_TOO_LARGE", "Annotate request body is too large.");
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

  checkAnnotateRequestBudget({
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
    const payload = AnnotateRequestSchema.parse(await parseBoundedJson(request));
    const annotation = await createAnnotation({
      query: payload.query,
      passageId: payload.passageId,
      passageText: payload.passageText,
      ...(payload.style !== undefined ? { style: payload.style } : {}),
      ...(payload.visitedPassageIds !== undefined
        ? { visitedPassageIds: payload.visitedPassageIds }
        : {}),
    });

    return buildSuccessResponse(annotation);
  } catch (error) {
    return buildErrorResponse(error);
  }
}
