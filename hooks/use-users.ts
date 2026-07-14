"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Paginated, UserView } from "@/models/view";

const KEY = "users";

export function useUsers(
  params: {
    page?: number;
    search?: string;
    role?: string;
    status?: string;
    sort?: string;
  } = {}
) {
  const query = new URLSearchParams();
  query.set("page", String(params.page ?? 1));
  if (params.search) query.set("search", params.search);
  if (params.role) query.set("role", params.role);
  if (params.status && params.status !== "all") query.set("status", params.status);
  if (params.sort) query.set("sort", params.sort);
  return useQuery({
    queryKey: [KEY, params],
    queryFn: () => api.get<Paginated<UserView>>(`/api/users?${query.toString()}`),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<UserView>("/api/users", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateUser(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch<UserView>(`/api/users/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
