"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { UserView } from "@/models/view";

/** Active cleaners for assignment dropdowns. Optionally filter by clientId. */
export function useCleaners(enabled = true, clientId?: string) {
  const query = clientId ? `?clientId=${clientId}` : "";
  return useQuery({
    queryKey: ["lookup", "cleaners", clientId],
    queryFn: () => api.get<UserView[]>(`/api/users/cleaners${query}`),
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
