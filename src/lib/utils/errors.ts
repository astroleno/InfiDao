import { ZodError } from "zod";
import type { ApiError, ApiResponse } from "@/types";

const INTERNAL_ERROR_MESSAGE = "Internal server error.";

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
    return new RouteError(
      400,
      "VALIDATION_ERROR",
      "Request payload does not match the reboot contract.",
      error.flatten(),
    );
  }

  if (error instanceof Error) {
    return new RouteError(500, "INTERNAL_ERROR", INTERNAL_ERROR_MESSAGE);
  }

  return new RouteError(500, "INTERNAL_ERROR", INTERNAL_ERROR_MESSAGE);
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
    message: normalized.status >= 500 ? INTERNAL_ERROR_MESSAGE : normalized.message,
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
