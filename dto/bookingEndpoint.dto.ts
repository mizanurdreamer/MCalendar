import { z } from "zod";

export const createBookingEndpointSchema = z.object({
  name: z.string().trim().min(1).max(120),
  url: z.string().trim().url().max(2000),
  isActive: z.boolean().default(true),
});

export const updateBookingEndpointSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  url: z.string().trim().url().max(2000).optional(),
  isActive: z.boolean().optional(),
});

export type CreateBookingEndpointDTO = z.infer<typeof createBookingEndpointSchema>;
export type UpdateBookingEndpointDTO = z.infer<typeof updateBookingEndpointSchema>;
