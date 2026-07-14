"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCleaners } from "@/hooks/use-lookups";
import { useCleanerTaskSchedules } from "@/hooks/use-cleaner-task-schedules";
import type { CleanerTaskScheduleView } from "@/models/view";

function isActiveNow(schedule: CleanerTaskScheduleView, now: Date) {
  if (!schedule.isActive) return false;
  const start = new Date(schedule.startDate);
  const end = schedule.endDate ? new Date(schedule.endDate) : null;
  return start <= now && (!end || end >= now);
}

export function CleanerAvailabilitySection() {
  const now = React.useMemo(() => new Date(), []);
  const cleaners = useCleaners(true);
  const schedules = useCleanerTaskSchedules({ activeOnly: true });

  const activeByCleaner = React.useMemo(() => {
    const map = new Map<string, CleanerTaskScheduleView[]>();
    for (const item of schedules.data?.items ?? []) {
      if (!isActiveNow(item, now)) continue;
      const list = map.get(item.cleanerId) ?? [];
      list.push(item);
      map.set(item.cleanerId, list);
    }
    return map;
  }, [now, schedules.data?.items]);

  return (
    <Card className="rounded-2xl border-slate-200 bg-white">
      <CardHeader className="pb-3">
        <CardTitle className="text-2xl font-bold text-slate-900">Cleaner Availability</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {(cleaners.data ?? []).map((cleaner) => {
          const activeTasks = activeByCleaner.get(cleaner.id) ?? [];
          const isAvailable = activeTasks.length === 0;
          return (
            <div
              key={cleaner.id}
              className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3"
            >
              <div>
                <p className="text-base font-semibold text-slate-900">
                  {cleaner.firstName} {cleaner.lastName}
                </p>
                <p className="text-sm text-slate-500">{cleaner.serviceArea || "No service area"}</p>
              </div>
              <div className="flex items-center gap-3">
                {isAvailable ? (
                  <Badge className="rounded-full border-transparent bg-emerald-500/20 text-emerald-700">
                    Available
                  </Badge>
                ) : (
                  <Badge className="rounded-full border-transparent bg-amber-500/20 text-amber-700">
                    Busy
                  </Badge>
                )}
                <p className="text-sm text-slate-500">
                  {isAvailable ? "No active task schedule" : `${activeTasks.length} active task`}
                </p>
              </div>
            </div>
          );
        })}
        {!cleaners.isLoading && (cleaners.data?.length ?? 0) === 0 && (
          <p className="text-sm text-slate-500">No cleaners found.</p>
        )}
      </CardContent>
    </Card>
  );
}
