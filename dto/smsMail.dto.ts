import { z } from "zod";

export const sendSmsViaEmailSchema = z
  .object({
    phone: z.string().trim().min(1).max(30),
    message: z.string().trim().min(1).max(1000),
    subject: z.string().trim().max(160).optional(),
    gatewayId: z.string().uuid().optional(),
    gatewayName: z.string().trim().max(120).optional(),
    domain: z.string().trim().max(255).optional(),
  })
  .refine(
    (v) => Boolean(v.gatewayId || v.gatewayName || v.domain),
    "Provide gatewayId, gatewayName, or domain",
  );

export type SendSmsViaEmailDTO = z.infer<typeof sendSmsViaEmailSchema>;
