import { z } from "zod";

export const createUserSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    email: z.string().email(),
    phone: z.string().trim().max(30).optional().or(z.literal("")),
    password: z.string().min(8).max(100),
    confirmPassword: z.string().min(8).max(100),
    role: z.enum(["SUPER_ADMIN", "CLIENT", "CLEANER"]),
    isActive: z.boolean().default(true),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const updateUserSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  role: z.enum(["SUPER_ADMIN", "CLIENT", "CLEANER"]).optional(),
  isActive: z.boolean().optional(),
});

export type CreateUserDTO = z.infer<typeof createUserSchema>;
export type UpdateUserDTO = z.infer<typeof updateUserSchema>;
