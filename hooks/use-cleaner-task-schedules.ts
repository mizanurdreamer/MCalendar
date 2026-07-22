"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CleanerTaskScheduleView, Paginated } from "@/models/view";

export function useCleanerTaskSchedules(params: { page?: number; activeOnly?: boolean } = {}) {
  const query = new URLSearchParams();
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", "50");
  if (params.activeOnly) query.set("activeOnly", "true");

  return useQuery({
    queryKey: ["cleaner-task-schedules", params],
    queryFn: () =>
      api.get<Paginated<CleanerTaskScheduleView>>(
        `/api/cleaner-task-schedules?${query.toString()}`,
      ),
  });
}

export type CreateTaskScheduleDTO = {
  clientId: string;
  cleanerId: string;
  assignedDate: string;
};

export function useCreateTaskSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTaskScheduleDTO) =>
      api.post<CleanerTaskScheduleView>("/api/cleaner-task-schedules", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cleaner-task-schedules"] }),
  });
}

export function useDeleteTaskSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/cleaner-task-schedules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cleaner-task-schedules"] }),
  });
}
