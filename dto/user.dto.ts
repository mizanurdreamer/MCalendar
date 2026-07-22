import { z } from "zod";
import { ROLE_VALUES } from "@/models/role";

export const createUserSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    email: z.string().email(),
    smsGatewayId: z.string().uuid().optional().or(z.literal("")),
    phone: z.string().trim().max(30).optional().or(z.literal("")),
    password: z.string().min(8).max(100),
    confirmPassword: z.string().min(8).max(100),
    role: z.enum(ROLE_VALUES),
    isActive: z.boolean().default(true),
    companyName: z.string().trim().max(160).optional().or(z.literal("")),
    primaryContact: z.string().trim().max(160).optional().or(z.literal("")),
    portfolioSize: z.coerce.number().int().min(0).max(100000).optional(),
    timezone: z.string().trim().max(80).optional().or(z.literal("")),
    serviceArea: z.string().trim().max(160).optional().or(z.literal("")),
    hourlyRate: z.coerce.number().int().min(0).max(10000).optional(),
    rating: z.coerce.number().min(0).max(5).optional(),
    clientId: z.string().uuid().optional().or(z.literal("")),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const updateUserSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  smsGatewayId: z.string().uuid().optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  role: z.enum(ROLE_VALUES).optional(),
  isActive: z.boolean().optional(),
  companyName: z.string().trim().max(160).optional().or(z.literal("")),
  primaryContact: z.string().trim().max(160).optional().or(z.literal("")),
  portfolioSize: z.coerce.number().int().min(0).max(100000).optional(),
  timezone: z.string().trim().max(80).optional().or(z.literal("")),
  serviceArea: z.string().trim().max(160).optional().or(z.literal("")),
  hourlyRate: z.coerce.number().int().min(0).max(10000).optional(),
  rating: z.coerce.number().min(0).max(5).optional(),
  clientId: z.string().uuid().optional().or(z.literal("")),
});

export type CreateUserDTO = z.infer<typeof createUserSchema>;
export type UpdateUserDTO = z.infer<typeof updateUserSchema>;
