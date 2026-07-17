"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CleanerCalendarDataView, CleaningStatus } from "@/models/view";

export function useCleanerCalendarData() {
  return useQuery({
    queryKey: ["cleaner-calendar-data"],
    queryFn: () => api.get<CleanerCalendarDataView>("/api/cleaner/calendar-data"),
  });
}

export function useUpdateTaskScheduleStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: CleaningStatus }) =>
      api.patch<unknown>(`/api/cleaner-task-schedules/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cleaner-calendar-data"] });
      qc.invalidateQueries({ queryKey: ["cleaner-task-schedules"] });
    },
  });
}
