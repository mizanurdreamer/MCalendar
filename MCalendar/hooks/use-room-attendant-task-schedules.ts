"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/util/api-client";
import type { RoomAttendantTaskScheduleView, Paginated } from "@/models/view";

export function useRoomAttendantTaskSchedules(params: { page?: number; activeOnly?: boolean } = {}) {
  const query = new URLSearchParams();
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", "50");
  if (params.activeOnly) query.set("activeOnly", "true");

  return useQuery({
    queryKey: ["room-attendant-task-schedules", params],
    queryFn: () =>
      api.get<Paginated<RoomAttendantTaskScheduleView>>(
        `/api/room-attendant-task-schedules?${query.toString()}`,
      ),
  });
}

export type CreateTaskScheduleDTO = {
  clientId: string;
  roomAttendantId: string;
  assignedDate: string;
};

export function useCreateTaskSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTaskScheduleDTO) =>
      api.post<RoomAttendantTaskScheduleView>("/api/room-attendant-task-schedules", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["room-attendant-task-schedules"] }),
  });
}

export function useDeleteTaskSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/room-attendant-task-schedules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["room-attendant-task-schedules"] }),
  });
}
