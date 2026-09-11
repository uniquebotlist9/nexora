/**
 * Application error type. Throwing an `AppError` anywhere in a route (or in an
 * async middleware wrapped with `asyncH`) surfaces it through the global error
 * handler as the platform-wide error envelope:
 *
 *   { "error": { "code": string, "message": string, "requestId": string } }
 */
export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  /** Optional machine-readable details (not exposed in the envelope today). */
  readonly details?: unknown;

  constructor(code: string, message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/** Common error codes used across routes. */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_JSON: 'INVALID_JSON',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_API_KEY: 'INVALID_API_KEY',
  RATE_LIMITED: 'RATE_LIMITED',
  INSUFFICIENT_SCOPE: 'INSUFFICIENT_SCOPE',
  FORBIDDEN: 'FORBIDDEN',
  GUILD_NOT_FOUND: 'GUILD_NOT_FOUND',
  GUILD_ACCESS_DENIED: 'GUILD_ACCESS_DENIED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PLAN_LIMIT_EXCEEDED: 'PLAN_LIMIT_EXCEEDED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
