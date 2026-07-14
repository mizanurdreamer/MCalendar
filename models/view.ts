/**
 * Client-facing view models. Dates arrive as ISO strings over JSON, so these
 * intentionally use `string` for timestamps.
 */
import type { Paginated } from "@/models";
import type { Role } from "@/models/role";
export type { Role } from "@/models/role";

export type UserView = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  companyName?: string | null;
  primaryContact?: string | null;
  portfolioSize?: number | null;
  timezone?: string | null;
  serviceArea?: string | null;
  hourlyRate?: number | null;
  rating?: number | null;
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
