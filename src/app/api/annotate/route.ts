import { z } from "zod";
import { createCapabilityNotReadyError } from "@/lib/reboot/status";
import { buildErrorResponse } from "@/lib/utils/errors";
import { RouteError } from "@/lib/utils/errors";

const AnnotateRequestSchema = z
  .object({
    query: z.string().trim().min(1).max(500),
    passageId: z.string().trim().min(1),
    passageText: z.string().trim().min(1),
    style: z.enum(["academic", "classical", "modern", "poetic"]).optional(),
  })
  .strict();

async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new RouteError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    AnnotateRequestSchema.parse(await parseJson(request));
    return buildErrorResponse(createCapabilityNotReadyError("annotate"));
  } catch (error) {
    return buildErrorResponse(error);
  }
}
