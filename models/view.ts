/**
 * Client-facing view models. Dates arrive as ISO strings over JSON, so these
 * intentionally use `string` for timestamps.
 */
import type { Paginated } from "@/models";

export type Role = "SUPER_ADMIN" | "CLIENT" | "CLEANER";

export type UserView = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  createdAt: string;
};

export type BookingEndpointView = {
  id: string;
  clientId: string;
  name: string;
  url: string;
  isActive: boolean;
  createdAt: string;
};

export type { Paginated };
