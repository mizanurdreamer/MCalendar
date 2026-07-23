import { z } from "zod";

const REGISTER_ROLE_VALUES = ["CLIENT", "ROOMATTENDATNT"] as const;

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const registerSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required").max(80),
    lastName: z.string().trim().min(1, "Last name is required").max(80),
    email: z.string().email("Enter a valid email"),
    phone: z.string().trim().min(1).max(15),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(100, "Password is too long"),
    confirmPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(100, "Password is too long"),
    // Public registration is limited to CLIENT / ROOMATTENDATNT. SUPER_ADMIN is seeded.
    role: z.enum(REGISTER_ROLE_VALUES).default("CLIENT"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type LoginDTO = z.infer<typeof loginSchema>;
export type RegisterDTO = z.infer<typeof registerSchema>;
