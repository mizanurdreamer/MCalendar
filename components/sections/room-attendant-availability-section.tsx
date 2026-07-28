"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useRoomAttendants } from "@/hooks/use-lookups";
import { useRoomAttendantAvailability } from "@/hooks/use-room-attendant-availability";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmt(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return `${DAYS[d.getDay()]}, ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function formatRange(from: string, to: string | null) {
  return to ? `${fmt(from)} – ${fmt(to)}` : `${fmt(from)} (open-ended)`;
}

export function RoomAttendantAvailabilitySection() {
  const roomAttendants = useRoomAttendants(true);
  const availability = useRoomAttendantAvailability({ activeOnly: true });

  const byRoomAttendant = React.useMemo(() => {
    const map = new Map<string, { id: string; fromDate: string; toDate: string | null; note: string | null }[]>();
    for (const item of availability.data?.items ?? []) {
      const list = map.get(item.roomAttendantId) ?? [];
      list.push({ id: item.id, fromDate: item.fromDate, toDate: item.toDate, note: item.note });
      map.set(item.roomAttendantId, list);
    }
    return map;
  }, [availability.data?.items]);

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-2xl font-bold ">Your Availability</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {(roomAttendants.data ?? []).map((roomAttendant) => {
          const slots = byRoomAttendant.get(roomAttendant.id) ?? [];
          return (
            <div key={roomAttendant.id} className="rounded-xl border border-border px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-base font-semibold ">
                    {roomAttendant.firstName} {roomAttendant.lastName}
                  </p>
                  <p className="text-sm text-muted-foreground">{roomAttendant.serviceArea || "No service area"}</p>
                </div>
                <Badge className="rounded-full border-transparent bg-emerald-500/20 text-emerald-700">
                  {slots.length > 0 ? `${slots.length} slot${slots.length > 1 ? "s" : ""}` : "No availability"}
                </Badge>
              </div>
              {slots.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {slots.map((s) => (
                     <li
                       key={s.id}
                       className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm"
                     >
                       <span className="font-medium text-foreground">
                         {formatRange(s.fromDate, s.toDate)}
                       </span>
                       {s.note && <span className="text-muted-foreground">{s.note}</span>}
                     </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        {!roomAttendants.isLoading && (roomAttendants.data?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">No Room Attendants found.</p>
        )}
      </CardContent>
    </Card>
  );
}
