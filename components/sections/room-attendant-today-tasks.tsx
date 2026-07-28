"use client";

import * as React from "react";
import { Check, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRoomAttendantCalendarData, useUpdateTaskScheduleStatus } from "@/hooks/use-room-attendant-calendar";
import { STATUS_LABEL } from "@/util/enums/CleaningStatusLabels";
import type { CleaningStatus } from "@/models/view";
import { RoomAttendantTaskStatus } from "@/util/enums/RoomAttendantTaskStatus";
import { toast } from "@/hooks/use-toast";

const NEXT_STATUS: Partial<Record<CleaningStatus, CleaningStatus>> = {
  [RoomAttendantTaskStatus.ASSIGNED]: RoomAttendantTaskStatus.CONFIRMED,
  [RoomAttendantTaskStatus.CONFIRMED]: RoomAttendantTaskStatus.IN_PROGRESS,
  [RoomAttendantTaskStatus.IN_PROGRESS]: RoomAttendantTaskStatus.DONE,
};

const STATUS_VARIANT: Record<CleaningStatus, string> = {
  [RoomAttendantTaskStatus.ASSIGNED]: "bg-indigo-500/20 text-indigo-700 dark:text-indigo-400",
  [RoomAttendantTaskStatus.CONFIRMED]: "bg-sky-500/20 text-sky-700 dark:text-sky-400",
  [RoomAttendantTaskStatus.IN_PROGRESS]: "bg-amber-500/20 text-amber-700 dark:text-amber-400",
  [RoomAttendantTaskStatus.DONE]: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400",
  [RoomAttendantTaskStatus.CANCELLED]: "bg-red-500/20 text-red-700 dark:text-red-400",
};

function fmtDate(dateStr: string) {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  return new Date(dateStr).toLocaleDateString(undefined, opts);
}

export function RoomAttendantTodayTasks() {
  const { data, isLoading } = useRoomAttendantCalendarData();
  const update = useUpdateTaskScheduleStatus();

  const assignments = data?.assignments ?? [];

  const onAdvance = async (id: string, current: CleaningStatus) => {
    const next = NEXT_STATUS[current];
    if (!next) return;
    try {
      await update.mutateAsync({ id, status: next });
      toast({ title: `Marked ${STATUS_LABEL[next].toLowerCase()}`, variant: "success" });
    } catch {
      toast({ title: "Update failed", variant: "error" });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-8 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your assignments…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-bold">Your room service assignments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No clients have assigned you yet.</p>
        ) : (
          assignments.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4"
            >
              <div>
                <p className="text-[17px] font-semibold">{a.clientName}</p>
                <p className="text-sm text-muted-foreground">{fmtDate(a.assignedDate)}</p>
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
