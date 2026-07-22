"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CleanerAvailabilityView, Paginated } from "@/models/view";

const KEY = "cleaner-availability";

export function useCleanerAvailability(params: { clientId?: string; cleanerId?: string; activeOnly?: boolean } = {}) {
  const query = new URLSearchParams();
  query.set("page", "1");
  query.set("pageSize", "100");
  if (params.clientId) query.set("clientId", params.clientId);
  if (params.cleanerId) query.set("cleanerId", params.cleanerId);
  if (params.activeOnly) query.set("activeOnly", "true");

  return useQuery({
    queryKey: [KEY, params],
    queryFn: () =>
      api.get<Paginated<CleanerAvailabilityView>>(`/api/cleaner-availability?${query.toString()}`),
  });
}

export type CreateAvailabilityDTO = {
  clientId: string;
  cleanerId: string;
  fromDate: string;
  toDate?: string | null;
  note?: string;
};

export function useCreateAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAvailabilityDTO) =>
      api.post<CleanerAvailabilityView>("/api/cleaner-availability", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateAvailability(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<CreateAvailabilityDTO & { isActive?: boolean }>) =>
      api.patch<CleanerAvailabilityView>(`/api/cleaner-availability/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/cleaner-availability/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
