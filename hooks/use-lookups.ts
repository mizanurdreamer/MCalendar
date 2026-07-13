"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { UserView } from "@/models/view";

/** Active cleaners for assignment dropdowns. */
export function useCleaners(enabled = true) {
  return useQuery({
    queryKey: ["lookup", "cleaners"],
    queryFn: () => api.get<UserView[]>("/api/users/cleaners"),
    enabled,
  });
}

/** Clients for owner-assignment (super admin). */
export function useClients(enabled = true) {
  return useQuery({
    queryKey: ["lookup", "clients"],
    queryFn: () => api.get<UserView[]>("/api/users/clients"),
    enabled,
  });
}
