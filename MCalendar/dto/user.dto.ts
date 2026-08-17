import { z } from "zod";
import { ROLE_VALUES } from "@/models/role";

export const createUserSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required").max(80),
    lastName: z.string().trim().min(1, "Last name is required").max(80),
    email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
    smsGatewayId: z.string().uuid().optional().or(z.literal("")),
    phone: z.string().trim().min(1, "Phone number is required").max(30),
    password: z.string().min(8, "Password must be at least 8 characters").max(100, "Password is too long"),
    confirmPassword: z.string().min(8, "Password must be at least 8 characters").max(100, "Password is too long"),
    role: z.enum(ROLE_VALUES),
    isActive: z.boolean().default(true),
    companyName: z.string().trim().max(160).optional().or(z.literal("")),
    portfolioSize: z.coerce.number().int().min(0).max(100000).optional(),
    timezone: z.string().trim().max(80).optional().or(z.literal("")),
    serviceArea: z.string().trim().max(160).optional().or(z.literal("")),
    hourlyRate: z.coerce.number().int().min(0).max(10000).optional(),
    rating: z.coerce.number().min(0).max(5).optional(),
    clientId: z.string().uuid().optional().or(z.literal("")),
    reuseExistingUser: z.boolean().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const updateUserSchema = z.object({
  firstName: z.string().trim().min(1, "First name cannot be empty").max(80).optional(),
  lastName: z.string().trim().min(1, "Last name cannot be empty").max(80).optional(),
  smsGatewayId: z.string().uuid().optional().or(z.literal("")),
  phone: z.string().trim().min(1, "Phone number is required").max(30),
  role: z.enum(ROLE_VALUES).optional(),
  isActive: z.boolean().optional(),
  companyName: z.string().trim().max(160).optional().or(z.literal("")),
  portfolioSize: z.coerce.number().int().min(0).max(100000).optional(),
  timezone: z.string().trim().max(80).optional().or(z.literal("")),
  serviceArea: z.string().trim().max(160).optional().or(z.literal("")),
  hourlyRate: z.coerce.number().int().min(0).max(10000).optional(),
  rating: z.coerce.number().min(0).max(5).optional(),
  clientId: z.string().uuid().optional().or(z.literal("")),
});

export type CreateUserDTO = z.infer<typeof createUserSchema>;
export type UpdateUserDTO = z.infer<typeof updateUserSchema>;
