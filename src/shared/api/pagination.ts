import { z } from "zod";

export interface PageParams {
  page: number;
  pageSize: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const pageParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(DEFAULT_PAGE),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

/**
 * Parses `page`/`pageSize` query params (offset pagination,
 * docs/context/api-conventions.md). Throws a `ZodError` on anything
 * malformed — caught by `withApiRoute` and mapped to the same
 * `422 VALIDATION_FAILED` shape as any other input-validation failure
 * (FR-015).
 */
export function parsePageParams(url: URL): PageParams {
  return pageParamsSchema.parse({
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
  });
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** Slices an already tenant-scoped, in-memory array per research.md's pagination decision. */
export function paginate<T>(items: T[], { page, pageSize }: PageParams): Page<T> {
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    total: items.length,
  };
}
