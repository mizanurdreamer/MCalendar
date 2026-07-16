import { z } from "zod";

export const createSmsGatewaySchema = z.object({
  name: z.string().trim().min(1).max(120),
  domain: z.string().trim().min(1).max(255),
  isActive: z.boolean().default(true),
});

export const updateSmsGatewaySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  domain: z.string().trim().min(1).max(255).optional(),
  isActive: z.boolean().optional(),
});

export type CreateSmsGatewayDTO = z.infer<typeof createSmsGatewaySchema>;
export type UpdateSmsGatewayDTO = z.infer<typeof updateSmsGatewaySchema>;
