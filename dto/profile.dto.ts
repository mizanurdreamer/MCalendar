import { z } from "zod";

export const updateClientProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  companyName: z.string().trim().max(160).optional().or(z.literal("")),
  primaryContact: z.string().trim().max(160).optional().or(z.literal("")),
  portfolioSize: z.coerce.number().int().min(0).max(100000).optional(),
  timezone: z.string().trim().max(80).optional().or(z.literal("")),
});

export const updateRoomAttendantProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  serviceArea: z.string().trim().max(160).optional().or(z.literal("")),
  hourlyRate: z.coerce.number().int().min(0).max(10000).optional(),
  rating: z.coerce.number().min(0).max(5).optional(),
});

export type UpdateClientProfileDTO = z.infer<typeof updateClientProfileSchema>;
export type UpdateRoomAttendantProfileDTO = z.infer<typeof updateRoomAttendantProfileSchema>;
