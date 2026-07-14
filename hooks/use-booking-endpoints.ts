"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { BookingEndpointView, Paginated } from "@/models/view";

const KEY = "booking-endpoints";

export function useBookingEndpoints(
  params: { page?: number; search?: string; status?: string } = {}
) {
  const query = new URLSearchParams();
  query.set("page", String(params.page ?? 1));
  if (params.search) query.set("search", params.search);
  if (params.status && params.status !== "all") query.set("status", params.status);
  return useQuery({
    queryKey: [KEY, params],
    queryFn: () =>
      api.get<Paginated<BookingEndpointView>>(
        `/api/booking-endpoints?${query.toString()}`,
      ),
  });
}

export function useCreateBookingEndpoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<BookingEndpointView>("/api/booking-endpoints", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateBookingEndpoint(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch<BookingEndpointView>(`/api/booking-endpoints/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteBookingEndpoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/booking-endpoints/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
