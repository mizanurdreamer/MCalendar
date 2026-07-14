"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CalendarDataView } from "@/models/view";

export function useCalendarData() {
  return useQuery({
    queryKey: ["client-calendar-data"],
    queryFn: () => api.get<CalendarDataView>("/api/client/calendar-data"),
  });
}
