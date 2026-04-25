import { ZodError } from "zod";
import type { ApiError, ApiResponse } from "@/types";

export class RouteError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "RouteError";
  }
}

function normalizeError(error: unknown): RouteError {
  if (error instanceof RouteError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new RouteError(400, "VALIDATION_ERROR", "Request payload does not match the reboot contract.", error.flatten());
  }

  if (error instanceof Error) {
    return new RouteError(500, "INTERNAL_ERROR", error.message);
  }

  return new RouteError(500, "INTERNAL_ERROR", "Unexpected error.");
}

export function buildSuccessResponse<T>(data: T, init?: ResponseInit): Response {
  return Response.json(
    {
      success: true,
      data,
    },
    init,
  );
}

export function buildErrorResponse(error: unknown): Response {
  const normalized = normalizeError(error);
  const exposeDetails = normalized.status < 500 && normalized.details !== undefined;
  const apiError: ApiError = {
    code: normalized.code,
    message: normalized.message,
    ...(exposeDetails ? { details: normalized.details } : {}),
  };

  return Response.json(
    {
      success: false,
      error: apiError,
    },
    { status: normalized.status },
  );
}
