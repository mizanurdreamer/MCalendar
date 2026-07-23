"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRoomAttendants } from "@/hooks/use-lookups";
import { useRoomAttendantAvailability } from "@/hooks/use-roomAttendant-availability";
import { EmptyRow } from "@/components/sections/shared-utils";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmt(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return `${DAYS[d.getDay()]}, ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

function formatRange(from: string, to: string | null) {
  return to ? `${fmt(from)} – ${fmt(to)}` : `${fmt(from)} (open-ended)`;
}

export function RoomAttendantAvailabilityView({ roomAttendantId }: { roomAttendantId: string }) {
  const roomAttendants = useRoomAttendants(true);
  const { data, isLoading } = useRoomAttendantAvailability({ roomAttendantId, activeOnly: true });

  const roomAttendant = React.useMemo(
    () => roomAttendants.data?.find((c) => c.id === roomAttendantId),
    [roomAttendants.data, roomAttendantId],
  );

  const slots = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[38px] font-extrabold tracking-tight ">
          Availability
          {roomAttendant && (
            <span className="ml-2 text-base font-normal text-slate-500">
              {roomAttendant.firstName} {roomAttendant.lastName}
              {roomAttendant.serviceArea ? ` · ${roomAttendant.serviceArea}` : ""}
            </span>
          )}
        </h1>
        <span className="rounded-full px-3 py-1 text-sm font-semibold text-slate-500">
          {slots.length.toLocaleString()} total
        </span>
      </div>

      <Card className="overflow-hidden rounded-2xl">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/70">
              <TableRow className="hover:bg-slate-50/70">
                <TableHead className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">
                  Date range
                </TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">
                  Note
                </TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {isLoading ? (
                <EmptyRow colSpan={3}>Loading...</EmptyRow>
              ) : slots.length === 0 ? (
                <EmptyRow colSpan={3}>No availability set.</EmptyRow>
              ) : (
                slots.map((slot) => (
                  <TableRow key={slot.id} className="h-[74px] border-slate-200 hover:bg-slate-50/40">
                    <TableCell>
                      <p className="text-[17px] font-semibold ">
                        {formatRange(slot.fromDate, slot.toDate)}
                      </p>
                    </TableCell>
                    <TableCell className="text-[17px] text-slate-600">{slot.note ?? "-"}</TableCell>
                    <TableCell>
                      <Badge className="rounded-full border-transparent bg-emerald-500/20 text-emerald-700">
                        Available
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
