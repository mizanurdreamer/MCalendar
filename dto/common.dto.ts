import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
});

export type PaginationDTO = z.infer<typeof paginationSchema>;

/** Parse pagination + search from a URLSearchParams. */
export function parseListParams(searchParams: URLSearchParams): PaginationDTO {
  return paginationSchema.parse({
    page: searchParams.get("page") ?? undefined,
    pageSize: searchParams.get("pageSize") ?? undefined,
    search: searchParams.get("search") ?? undefined,
  });
}

export const uuidSchema = z.string().uuid("Invalid identifier");
