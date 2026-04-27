import {
  getAnnotationTelemetryEvents,
  summarizeAnnotationTelemetryEvents,
} from "@/lib/annotation/telemetry";
import { resolveAnnotationLlmRuntimeStatus } from "@/lib/annotation/llm";
import { buildErrorResponse, buildSuccessResponse, RouteError } from "@/lib/utils/errors";

function assertTelemetryEndpointEnabled(): void {
  if (process.env.NODE_ENV === "production") {
    throw new RouteError(404, "NOT_FOUND", "Not found.");
  }
}

export async function GET(): Promise<Response> {
  try {
    assertTelemetryEndpointEnabled();

    const events = getAnnotationTelemetryEvents();

    return buildSuccessResponse({
      events,
      summary: summarizeAnnotationTelemetryEvents(events),
      llm: resolveAnnotationLlmRuntimeStatus(),
    });
  } catch (error) {
    return buildErrorResponse(error);
  }
}
