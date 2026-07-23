import { z } from "zod";

export const createBookingProviderSchema = z.object({
  name: z.string().trim().min(1).max(120),
  url: z.string().trim().url().max(2000),
  isActive: z.boolean().default(true),
});

export const updateBookingProviderSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  url: z.string().trim().url().max(2000).optional(),
  isActive: z.boolean().optional(),
});

export type CreateBookingProviderDTO = z.infer<typeof createBookingProviderSchema>;
export type UpdateBookingProviderDTO = z.infer<typeof updateBookingProviderSchema>;
