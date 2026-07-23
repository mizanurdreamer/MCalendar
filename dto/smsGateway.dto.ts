import { z } from "zod";

export const createSmsGatewaySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "Name is too long"),
  domain: z.string().trim().min(1, "Domain is required").max(255, "Domain is too long"),
  isActive: z.boolean().default(true),
});

export const updateSmsGatewaySchema = z.object({
  name: z.string().trim().min(1, "Name cannot be empty").max(120, "Name is too long").optional(),
  domain: z.string().trim().min(1, "Domain cannot be empty").max(255, "Domain is too long").optional(),
  isActive: z.boolean().optional(),
});

export type CreateSmsGatewayDTO = z.infer<typeof createSmsGatewaySchema>;
export type UpdateSmsGatewayDTO = z.infer<typeof updateSmsGatewaySchema>;
