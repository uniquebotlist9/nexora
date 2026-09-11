import { z, type ZodTypeAny } from 'zod';
import type { PaginatedResult } from '@nexora/types';
import { paginationSchema } from '@nexora/validation';
import { AppError, ERROR_CODES } from './errors';

export interface Pagination {
  page: number;
  pageSize: number;
}

/**
 * Validate an unknown value (query, params, body) against a zod schema.
 * Throws a 400 VALIDATION_ERROR with a human-readable issue list.
 */
export function parse<S extends ZodTypeAny>(schema: S, value: unknown, what: string): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'value'}: ${issue.message}`)
      .join('; ');
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, `Invalid ${what}: ${message}`, 400, {
      issues: result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
    });
  }
  return result.data;
}

/** Parse `page` / `pageSize` from a query string into a pagination window. */
export function parsePagination(query: unknown): Pagination {
  return parse(paginationSchema, query, 'pagination parameters');
}

/** Build the platform-standard paginated result envelope. */
export function paginated<T>(items: T[], total: number, page: number, pageSize: number): PaginatedResult<T> {
  return {
    items,
    total,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
  };
}

/** The offset for a pagination window (0-based). */
export function offset(p: Pagination): number {
  return (p.page - 1) * p.pageSize;
}
