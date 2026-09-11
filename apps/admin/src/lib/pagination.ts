/**
 * Shared pagination parsing for server-rendered tables driven by searchParams.
 */

export type SearchParams = Record<string, string | string[] | undefined>;

export interface Pagination {
  page: number;
  pageSize: number;
  skip: number;
  pageCount: number;
}

export function parsePagination(
  searchParams: SearchParams,
  total: number,
  defaultPageSize = 25,
): Pagination {
  const pageSize = defaultPageSize;
  const rawPage = Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page;
  const parsed = Number.parseInt(rawPage ?? '1', 10);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Number.isNaN(parsed) ? 1 : Math.min(Math.max(1, parsed), pageCount);
  return { page, pageSize, skip: (page - 1) * pageSize, pageCount };
}

export function param(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  if (Array.isArray(value)) return value[0];
  return value;
}
