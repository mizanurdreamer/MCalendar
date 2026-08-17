"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/util/api-client";
import type { Paginated, SmsGatewayView } from "@/models/view";

const KEY = "sms-gateways";

export function useSmsGateways(
  params: { page?: number; pageSize?: number; search?: string; status?: string } = {},
) {
  const query = new URLSearchParams();
  query.set("page", String(params.page ?? 1));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  if (params.search) query.set("search", params.search);
  if (params.status && params.status !== "all") query.set("status", params.status);
  return useQuery({
    queryKey: [KEY, params],
    queryFn: () => api.get<Paginated<SmsGatewayView>>(`/api/sms-gateways?${query.toString()}`),
  });
}

export function useCreateSmsGateway() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<SmsGatewayView>("/api/sms-gateways", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateSmsGateway(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch<SmsGatewayView>(`/api/sms-gateways/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteSmsGateway() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/sms-gateways/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
