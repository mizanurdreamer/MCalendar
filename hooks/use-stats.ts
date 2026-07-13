"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { DashboardStat } from "@/services/StatsService";

export function useStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: () => api.get<DashboardStat[]>("/api/stats"),
  });
}
