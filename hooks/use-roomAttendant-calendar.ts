"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { RoomAttendantCalendarDataView, CleaningStatus } from "@/models/view";

export function useRoomAttendantCalendarData() {
  return useQuery({
    queryKey: ["roomAttendant-calendar-data"],
    queryFn: () => api.get<RoomAttendantCalendarDataView>("/api/roomAttendant/calendar-data"),
  });
}

export function useUpdateTaskScheduleStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: CleaningStatus }) =>
      api.patch<unknown>(`/api/roomAttendant-task-schedules/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roomAttendant-calendar-data"] });
      qc.invalidateQueries({ queryKey: ["roomAttendant-task-schedules"] });
    },
  });
}
