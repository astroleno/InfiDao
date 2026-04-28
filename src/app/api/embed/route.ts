import { buildErrorResponse, RouteError } from "@/lib/utils/errors";

const DISABLED_MESSAGE =
  "The legacy embedding API is disabled in the reboot MVP. Use /api/search for query handling.";

export async function POST(): Promise<Response> {
  return buildErrorResponse(new RouteError(410, "LEGACY_EMBED_DISABLED", DISABLED_MESSAGE));
}

export async function GET(): Promise<Response> {
  return buildErrorResponse(new RouteError(410, "LEGACY_EMBED_DISABLED", DISABLED_MESSAGE));
}
