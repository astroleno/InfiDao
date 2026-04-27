import { RouteError } from "@/lib/utils/errors";

export const ANNOTATE_BODY_LIMIT_BYTES = 4096;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;

interface CheckAnnotateRequestBudgetOptions {
  clientKey: string;
  bodyBytes: number;
  now?: number;
}

interface Bucket {
  windowStart: number;
  count: number;
}

const buckets = new Map<string, Bucket>();

export function checkAnnotateRequestBudget({
  clientKey,
  bodyBytes,
  now = Date.now(),
}: CheckAnnotateRequestBudgetOptions): void {
  if (bodyBytes > ANNOTATE_BODY_LIMIT_BYTES) {
    throw new RouteError(413, "REQUEST_TOO_LARGE", "Annotate request body is too large.", {
      limitBytes: ANNOTATE_BODY_LIMIT_BYTES,
    });
  }

  const bucket = buckets.get(clientKey);

  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(clientKey, {
      windowStart: now,
      count: 1,
    });
    return;
  }

  bucket.count += 1;

  if (bucket.count > MAX_REQUESTS_PER_WINDOW) {
    throw new RouteError(429, "RATE_LIMITED", "Too many annotation requests. Try again shortly.");
  }
}

export function resetAnnotateAbuseGuard(): void {
  buckets.clear();
}
