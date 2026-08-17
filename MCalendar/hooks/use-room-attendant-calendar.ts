"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/util/api-client";
import type { RoomAttendantCalendarDataView, CleaningStatus } from "@/models/view";

export function useRoomAttendantCalendarData() {
  return useQuery({
    queryKey: ["room-attendant-calendar-data"],
    queryFn: () => api.get<RoomAttendantCalendarDataView>("/api/room-attendant/calendar-data"),
  });
}

export function useUpdateTaskScheduleStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: CleaningStatus }) =>
      api.patch<unknown>(`/api/room-attendant-task-schedules/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["room-attendant-calendar-data"] });
      qc.invalidateQueries({ queryKey: ["room-attendant-task-schedules"] });
    },
  });
}
