/**
 * Domain error hierarchy. Services throw these; the API layer maps them to
 * standardized HTTP responses (see util/response.ts -> handleApiError).
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
    public readonly code: string = "APP_ERROR",
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request", details?: unknown) {
    super(message, 400, "BAD_REQUEST", details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Not authenticated") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You are not allowed to perform this action") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource conflict") {
    super(message, 409, "CONFLICT");
  }
}
