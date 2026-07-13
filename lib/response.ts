import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "@/lib/errors";

/**
 * Standardized API envelope used by every route handler.
 */
export type ApiSuccess<T> = {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
};

export type ApiFailure = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function ok<T>(data: T, init?: { status?: number; meta?: Record<string, unknown> }) {
  return NextResponse.json<ApiSuccess<T>>(
    { success: true, data, meta: init?.meta },
    { status: init?.status ?? 200 },
  );
}

export function created<T>(data: T, meta?: Record<string, unknown>) {
  return ok(data, { status: 201, meta });
}

export function fail(code: string, message: string, status = 400, details?: unknown) {
  return NextResponse.json<ApiFailure>(
    { success: false, error: { code, message, details } },
    { status },
  );
}

/**
 * Central error translator. Wrap route handler bodies in try/catch and pass
 * the caught error here so all failures share one shape.
 */
export function handleApiError(error: unknown) {
  if (error instanceof ZodError) {
    return fail("VALIDATION_ERROR", "Validation failed", 422, error.flatten());
  }

  if (error instanceof AppError) {
    return fail(error.code, error.message, error.status, error.details);
  }

  // Prisma unique-constraint style errors surface a `code` of P2002.
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: string }).code;
    if (code === "P2002") {
      return fail("CONFLICT", "A record with these values already exists", 409);
    }
    if (code === "P2025") {
      return fail("NOT_FOUND", "Resource not found", 404);
    }
  }

  console.error("[UNHANDLED_API_ERROR]", error);
  return fail("INTERNAL_ERROR", "Something went wrong", 500);
}
