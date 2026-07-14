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
};

export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "SUPER_ADMIN" | "CLIENT" | "CLEANER";
};

export type ActorContext = {
  userId: string;
  role: "SUPER_ADMIN" | "CLIENT" | "CLEANER";
};
