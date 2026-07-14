"use client";

import { useQuery } from "@tanstack/react-query";
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
