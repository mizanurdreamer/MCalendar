"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/util/api-client";
import type { BookingProviderView, Paginated } from "@/models/view";

const KEY = "booking-providers";

export function useBookingProviders(
  params: { page?: number; search?: string; status?: string } = {}
) {
  const query = new URLSearchParams();
  query.set("page", String(params.page ?? 1));
  if (params.search) query.set("search", params.search);
  if (params.status && params.status !== "all") query.set("status", params.status);
  return useQuery({
    queryKey: [KEY, params],
    queryFn: () =>
      api.get<Paginated<BookingProviderView>>(
        `/api/booking-providers?${query.toString()}`,
      ),
  });
}

export function useCreateBookingProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<BookingProviderView>("/api/booking-providers", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateBookingProvider(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch<BookingProviderView>(`/api/booking-providers/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteBookingProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/booking-providers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
