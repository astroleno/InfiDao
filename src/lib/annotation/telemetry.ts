import type { AnnotationLlmMode, AnnotationLlmSlot } from "@/lib/annotation/llm";

export type AnnotationTelemetryProvider = "cache" | "deterministic" | "llm";
export type AnnotationFallbackReason =
  | "not_configured"
  | "provider_error"
  | "slot_failover"
  | "timeout";

export interface AnnotationTelemetryEvent {
  name: "annotation.create";
  mode: AnnotationLlmMode;
  provider: AnnotationTelemetryProvider;
  elapsedMs: number;
  cacheHit: boolean;
  fallbackHit: boolean;
  timestamp: string;
  fallbackReason?: AnnotationFallbackReason;
  model?: string;
  slot?: AnnotationLlmSlot;
}

const MAX_TELEMETRY_EVENTS = 100;
const telemetryEvents: AnnotationTelemetryEvent[] = [];

function shouldLogTelemetry(): boolean {
  return process.env.NODE_ENV !== "test" && process.env.ANNOTATION_TELEMETRY !== "off";
}

export function recordAnnotationTelemetry(
  event: Omit<AnnotationTelemetryEvent, "name" | "timestamp"> & { timestamp?: string },
): void {
  const normalizedEvent: AnnotationTelemetryEvent = {
    name: "annotation.create",
    timestamp: event.timestamp ?? new Date().toISOString(),
    mode: event.mode,
    provider: event.provider,
    elapsedMs: Math.max(0, Math.round(event.elapsedMs)),
    cacheHit: event.cacheHit,
    fallbackHit: event.fallbackHit,
    ...(event.fallbackReason !== undefined ? { fallbackReason: event.fallbackReason } : {}),
    ...(event.model !== undefined ? { model: event.model } : {}),
    ...(event.slot !== undefined ? { slot: event.slot } : {}),
  };

  telemetryEvents.push(normalizedEvent);

  if (telemetryEvents.length > MAX_TELEMETRY_EVENTS) {
    telemetryEvents.shift();
  }

  if (shouldLogTelemetry()) {
    console.info("[annotation]", JSON.stringify(normalizedEvent));
  }
}

export function getAnnotationTelemetryEvents(): AnnotationTelemetryEvent[] {
  return telemetryEvents.map(event => ({ ...event }));
}

export function resetAnnotationTelemetry(): void {
  telemetryEvents.length = 0;
}
