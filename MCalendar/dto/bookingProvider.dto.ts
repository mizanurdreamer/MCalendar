import { z } from "zod";

export const createBookingProviderSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "Name is too long"),
  url: z.string().trim().min(1, "URL is required").url("Enter a valid URL").max(2000, "URL is too long"),
  isActive: z.boolean().default(true),
});

export const updateBookingProviderSchema = z.object({
  name: z.string().trim().min(1, "Name cannot be empty").max(120, "Name is too long").optional(),
  url: z.string().trim().min(1, "URL cannot be empty").url("Enter a valid URL").max(2000, "URL is too long").optional(),
  isActive: z.boolean().optional(),
});

export type CreateBookingProviderDTO = z.infer<typeof createBookingProviderSchema>;
export type UpdateBookingProviderDTO = z.infer<typeof updateBookingProviderSchema>;
