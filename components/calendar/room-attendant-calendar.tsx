"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import type { EventInput } from "@fullcalendar/core";
import { Loader2 } from "lucide-react";
import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";
import {
  CalendarGrid,
  moveCalendar,
  changeCalendarView,
  type CalendarViewMode,
} from "@/components/calendar/calendar-grid";
import { UpcomingCleanings } from "@/components/calendar/upcoming-cleanings";
import { useRoomAttendantCalendarData } from "@/hooks/use-room-attendant-calendar";
import type { RoomAttendantCalendarEventView, CleaningStatus } from "@/models/view";
import { RoomAttendantTaskStatus } from "@/util/enums/RoomAttendantTaskStatus";
import { STATUS_CLASS, STATUS_LABEL } from "@/util/enums/CleaningStatusLabels";

const DEFAULT_PROPERTY = "All properties";

function toEventInput(event: RoomAttendantCalendarEventView): EventInput {
  if (event.kind === "booking") {
    return {
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      allDay: event.allDay,
      classNames: ["evt-booking"],
      extendedProps: { kind: "booking" },
    };
  }

  if (event.kind === "availability") {
    return {
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      allDay: event.allDay,
      classNames: ["evt-availability"],
      extendedProps: { kind: "availability" },
    };
  }

  if (event.kind === "cleaning") {
    const status = event.cleaningStatus ?? RoomAttendantTaskStatus.ASSIGNED;
    return {
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      allDay: event.allDay,
      classNames: ["evt-cleaning", STATUS_CLASS[status]],
      extendedProps: {
        kind: "cleaning",
        property: event.property,
        clientName: event.clientName,
        cleaningStatus: status,
        status: STATUS_LABEL[status],
      },
    };
  }

  const status = event.cleaningStatus ?? RoomAttendantTaskStatus.ASSIGNED;
  return {
    id: event.id,
    title: event.title,
    start: event.start,
    end: event.end,
    allDay: event.allDay,
    classNames: ["evt-booking", STATUS_CLASS[status]],
    extendedProps: {
      kind: "booking",
      property: event.property,
      clientName: event.clientName,
      cleaningStatus: status,
    },
  };
}

export function RoomAttendantCalendar() {
  const calendarRef = useRef<FullCalendar | null>(null);
  const { data, isLoading } = useRoomAttendantCalendarData();

  const initialDate = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }, []);

  const [title, setTitle] = useState(() =>
    new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date()),
  );
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [activeProperty, setActiveProperty] = useState(DEFAULT_PROPERTY);
  const [search, setSearch] = useState("");

  const properties = useMemo(() => {
    const names = Array.from(
      new Set((data?.events ?? []).map((e) => e.property).filter(Boolean)),
    ) as string[];
    return [DEFAULT_PROPERTY, ...names];
  }, [data?.events]);

  const events = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    console.log(data);
    return (data?.events ?? [])
      .filter((e) =>
        activeProperty === DEFAULT_PROPERTY ? true : e.property === activeProperty,
      )
      .filter((e) => {
        if (!normalizedSearch) return true;
        const haystack = `${e.title} ${e.property ?? ""} ${e.clientName ?? ""}`.toLowerCase();
        return haystack.includes(normalizedSearch);
      })
      .map(toEventInput);
  }, [data?.events, activeProperty, search]);

  const upcoming = useMemo(
    () =>
      (data?.events ?? [])
        .filter((e) => e.kind === "booking" && e.end && new Date(e.end) >= new Date())
        .sort((a, b) => (a.end! < b.end! ? -1 : 1))
        .slice(0, 8)
        .map((e) => ({
          day: new Date(e.end!).getDate().toString().padStart(2, "0"),
          month: new Date(e.end!).toLocaleString("en-US", { month: "short" }).toUpperCase(),
          property: e.property ?? "Property",
          note: `${e.clientName ?? "Client"} · ${STATUS_LABEL[e.cleaningStatus ?? RoomAttendantTaskStatus.ASSIGNED]}`,
          status: String(e.cleaningStatus ?? RoomAttendantTaskStatus.ASSIGNED),
        })),
    [data?.events],
  );

  const go = (direction: "prev" | "next") => {
    const nextTitle = moveCalendar(calendarRef, direction);
    if (nextTitle) setTitle(nextTitle);
  };

  const onViewModeChange = (mode: CalendarViewMode) => {
    setViewMode(mode);
    const nextTitle = changeCalendarView(calendarRef, mode);
    if (nextTitle) setTitle(nextTitle);
  };

  return (
    <div className="grid gap-4 rounded-3xl p-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="space-y-3 md:space-y-4">
        <CalendarToolbar
          title={title}
          viewMode={viewMode}
          properties={properties}
          activeProperty={activeProperty}
          search={search}
          onChangeSearch={setSearch}
          onChangeProperty={setActiveProperty}
          onNavigate={go}
          onViewModeChange={onViewModeChange}
        />

        {isLoading ? (
          <div className="flex min-h-[560px] items-center justify-center rounded-3xl border">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <CalendarGrid
            calendarRef={calendarRef}
            events={events}
            onDateTitleChange={setTitle}
            initialDate={initialDate}
            viewMode={viewMode}
          />
        )}

        <div className="flex flex-wrap items-center gap-4 px-1 pb-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#48b89f] dark:bg-[#48b89f]" />Available</span>
          <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#0ea5e9] dark:bg-[#38bdf8]" />Confirmed</span>
          <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#6366f1] dark:bg-[#818cf8]" />Assigned</span>
          <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#f59e0b] dark:bg-[#fbbf24]" />In progress</span>
          <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#22c55e] dark:bg-[#4ade80]" />Done</span>
          <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#ef4444] dark:bg-[#f87171]" />Cancelled</span>
        </div>
      </section>

      <aside className="space-y-4">
        <UpcomingCleanings items={upcoming} />
      </aside>
    </div>
  );
}
