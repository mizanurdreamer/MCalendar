/**
 * Shared, framework-agnostic domain types used across services, repositories,
 * and the UI layer.
 */

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type ListParams = {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  clientId?: string;
};

export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: import("@/models/role").Role;
};

export type ActorContext = {
  userId: string;
  role: import("@/models/role").Role;
};

export { ROLE_VALUES, isRole, type Role } from "@/models/role";
