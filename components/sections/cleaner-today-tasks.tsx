"use client";

import * as React from "react";
import { Check, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCleanerCalendarData, useUpdateTaskScheduleStatus } from "@/hooks/use-cleaner-calendar";
import { STATUS_LABEL } from "@/components/calendar/cleaner-calendar";
import type { CleaningStatus } from "@/models/view";
import { toast } from "@/hooks/use-toast";

const NEXT_STATUS: Partial<Record<CleaningStatus, CleaningStatus>> = {
  ASSIGNED: "CONFIRMED",
  CONFIRMED: "IN_PROGRESS",
  IN_PROGRESS: "DONE",
};

const STATUS_VARIANT: Record<CleaningStatus, string> = {
  ASSIGNED: "bg-indigo-500/20 text-indigo-700",
  CONFIRMED: "bg-sky-500/20 text-sky-700",
  IN_PROGRESS: "bg-amber-500/20 text-amber-700",
  DONE: "bg-emerald-500/20 text-emerald-700",
  CANCELLED: "bg-red-500/20 text-red-700",
};

function fmtDate(dateStr: string) {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  return new Date(dateStr).toLocaleDateString(undefined, opts);
}

export function CleanerTodayTasks() {
  const { data, isLoading } = useCleanerCalendarData();
  const update = useUpdateTaskScheduleStatus();

  const assignments = data?.assignments ?? [];

  const onAdvance = async (id: string, current: CleaningStatus) => {
    const next = NEXT_STATUS[current];
    if (!next) return;
    try {
      await update.mutateAsync({ id, status: next });
      toast({ title: `Marked ${STATUS_LABEL[next].toLowerCase()}` });
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your assignments…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-bold">My cleaning assignments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {assignments.length === 0 ? (
          <p className="text-sm text-slate-500">No clients have assigned you yet.</p>
        ) : (
          assignments.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4"
            >
              <div>
                <p className="text-[17px] font-semibold text-slate-900">{a.clientName}</p>
                <p className="text-sm text-slate-500">{fmtDate(a.assignedDate)}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge className={`rounded-full border-transparent ${STATUS_VARIANT[a.status]}`}>
                  {STATUS_LABEL[a.status]}
                </Badge>
                {NEXT_STATUS[a.status] && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 rounded-xl"
                    disabled={update.isPending}
                    onClick={() => onAdvance(a.id, a.status)}
                  >
                    {update.isPending ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-1 h-4 w-4" />
                    )}
                    Mark {STATUS_LABEL[NEXT_STATUS[a.status]!].toLowerCase()}
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
