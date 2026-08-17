"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/util/api-client";
import type { UserView } from "@/models/view";

/** Active room-attendants for assignment dropdowns. Optionally filter by clientId. */
export function useRoomAttendants(enabled = true, clientId?: string) {
  const query = clientId ? `?clientId=${clientId}` : "";
  return useQuery({
    queryKey: ["lookup", "room-attendants", clientId],
    queryFn: () => api.get<UserView[]>(`/api/users/room-attendants${query}`),
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
