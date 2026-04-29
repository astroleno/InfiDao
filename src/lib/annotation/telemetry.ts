import { createHash } from "node:crypto";
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
  queryHash?: string;
  passageId?: string;
  explorationDepth?: number;
}

interface AnnotationLatencyPercentiles {
  p50: number;
  p95: number;
  p99: number;
}

interface AnnotationTelemetryBreakdown {
  count: number;
  fallbackHits: number;
  fallbackRate: number;
  averageElapsedMs: number;
  latency: AnnotationLatencyPercentiles;
}

export interface AnnotationTelemetryAlert {
  code: "FALLBACK_RATE_HIGH" | "P95_LATENCY_HIGH";
  message: string;
  threshold: number;
  actual: number;
}

export interface AnnotationTelemetrySummary {
  count: number;
  cacheHits: number;
  fallbackHits: number;
  fallbackRate: number;
  averageElapsedMs: number;
  latency: AnnotationLatencyPercentiles;
  byProvider: Record<AnnotationTelemetryProvider, number>;
  byMode: Record<AnnotationLlmMode, number>;
  bySlot: Record<AnnotationLlmSlot | "unknown", number>;
  byQueryHash: Record<string, AnnotationTelemetryBreakdown>;
  byExplorationDepth: Record<string, AnnotationTelemetryBreakdown>;
  byFallbackReason: Partial<Record<AnnotationFallbackReason, number>>;
  alerts: AnnotationTelemetryAlert[];
}

const MAX_TELEMETRY_EVENTS = 100;
const DEFAULT_FALLBACK_ALERT_RATE = 0.15;
const DEFAULT_P95_ALERT_MS = 5_000;
const telemetryEvents: AnnotationTelemetryEvent[] = [];

function shouldLogTelemetry(): boolean {
  return process.env.NODE_ENV !== "test" && process.env.ANNOTATION_TELEMETRY !== "off";
}

function normalizeTelemetryText(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function resolvePositiveNumberEnv(key: string, fallback: number): number {
  const rawValue = process.env[key]?.trim();

  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number(rawValue);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return fallback;
  }

  return parsedValue;
}

export function buildAnnotationQueryHash(query: string): string {
  return createHash("sha256").update(normalizeTelemetryText(query)).digest("hex").slice(0, 12);
}

function percentile(values: number[], quantile: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sortedValues = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(quantile * sortedValues.length) - 1);

  return sortedValues[index] ?? 0;
}

function buildLatencyPercentiles(events: AnnotationTelemetryEvent[]): AnnotationLatencyPercentiles {
  const elapsedValues = events.map(event => event.elapsedMs);

  return {
    p50: percentile(elapsedValues, 0.5),
    p95: percentile(elapsedValues, 0.95),
    p99: percentile(elapsedValues, 0.99),
  };
}

function summarizeBreakdown(events: AnnotationTelemetryEvent[]): AnnotationTelemetryBreakdown {
  const fallbackHits = events.filter(event => event.fallbackHit).length;
  const totalElapsedMs = events.reduce((total, event) => total + event.elapsedMs, 0);

  return {
    count: events.length,
    fallbackHits,
    fallbackRate: events.length > 0 ? Number((fallbackHits / events.length).toFixed(4)) : 0,
    averageElapsedMs: events.length > 0 ? Math.round(totalElapsedMs / events.length) : 0,
    latency: buildLatencyPercentiles(events),
  };
}

function groupBreakdowns(
  events: AnnotationTelemetryEvent[],
  resolveKey: (event: AnnotationTelemetryEvent) => string | undefined,
): Record<string, AnnotationTelemetryBreakdown> {
  const groups = new Map<string, AnnotationTelemetryEvent[]>();

  for (const event of events) {
    const key = resolveKey(event);

    if (!key) {
      continue;
    }

    groups.set(key, [...(groups.get(key) ?? []), event]);
  }

  return Object.fromEntries(
    [...groups.entries()].map(([key, groupedEvents]) => [
      key,
      summarizeBreakdown(groupedEvents),
    ]),
  );
}

export function recordAnnotationTelemetry(
  event: Omit<AnnotationTelemetryEvent, "name" | "timestamp" | "queryHash"> & {
    timestamp?: string;
    query?: string;
  },
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
    ...(event.query !== undefined ? { queryHash: buildAnnotationQueryHash(event.query) } : {}),
    ...(event.passageId !== undefined ? { passageId: event.passageId } : {}),
    ...(event.explorationDepth !== undefined
      ? { explorationDepth: Math.max(1, Math.round(event.explorationDepth)) }
      : {}),
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

export function summarizeAnnotationTelemetryEvents(
  events = getAnnotationTelemetryEvents(),
): AnnotationTelemetrySummary {
  const fallbackAlertRate = resolvePositiveNumberEnv(
    "ANNOTATION_FALLBACK_ALERT_RATE",
    DEFAULT_FALLBACK_ALERT_RATE,
  );
  const p95AlertMs = resolvePositiveNumberEnv(
    "ANNOTATION_P95_ALERT_MS",
    DEFAULT_P95_ALERT_MS,
  );
  const summary: AnnotationTelemetrySummary = {
    count: events.length,
    cacheHits: 0,
    fallbackHits: 0,
    fallbackRate: 0,
    averageElapsedMs: 0,
    latency: buildLatencyPercentiles(events),
    byProvider: {
      cache: 0,
      deterministic: 0,
      llm: 0,
    },
    byMode: {
      fast: 0,
      quality: 0,
    },
    bySlot: {
      primary: 0,
      secondary: 0,
      unknown: 0,
    },
    byQueryHash: {},
    byExplorationDepth: {},
    byFallbackReason: {},
    alerts: [],
  };

  let totalElapsedMs = 0;

  for (const event of events) {
    totalElapsedMs += event.elapsedMs;
    summary.byProvider[event.provider] += 1;
    summary.byMode[event.mode] += 1;
    summary.bySlot[event.slot ?? "unknown"] += 1;

    if (event.cacheHit) {
      summary.cacheHits += 1;
    }

    if (event.fallbackHit) {
      summary.fallbackHits += 1;
    }

    if (event.fallbackReason !== undefined) {
      summary.byFallbackReason[event.fallbackReason] =
        (summary.byFallbackReason[event.fallbackReason] ?? 0) + 1;
    }
  }

  summary.averageElapsedMs = events.length > 0 ? Math.round(totalElapsedMs / events.length) : 0;
  summary.fallbackRate =
    events.length > 0 ? Number((summary.fallbackHits / events.length).toFixed(4)) : 0;
  summary.byQueryHash = groupBreakdowns(events, event => event.queryHash);
  summary.byExplorationDepth = groupBreakdowns(events, event =>
    event.explorationDepth === undefined ? undefined : String(event.explorationDepth),
  );

  if (summary.fallbackRate > fallbackAlertRate) {
    summary.alerts.push({
      code: "FALLBACK_RATE_HIGH",
      message: "Annotation fallback rate exceeded the configured threshold.",
      threshold: fallbackAlertRate,
      actual: summary.fallbackRate,
    });
  }

  if (summary.latency.p95 > p95AlertMs) {
    summary.alerts.push({
      code: "P95_LATENCY_HIGH",
      message: "Annotation p95 latency exceeded the configured threshold.",
      threshold: p95AlertMs,
      actual: summary.latency.p95,
    });
  }

  return summary;
}

export function resetAnnotationTelemetry(): void {
  telemetryEvents.length = 0;
}
