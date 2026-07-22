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
import { useCleanerCalendarData } from "@/hooks/use-cleaner-calendar";
import type { CleanerCalendarEventView, CleaningStatus } from "@/models/view";
import { CleanerTaskStatus } from "@/lib/enums/CleanerTaskStatus";

const STATUS_CLASS: Record<CleaningStatus, string> = {
  [CleanerTaskStatus.ASSIGNED]: "evt-assigned",
  [CleanerTaskStatus.CONFIRMED]: "evt-confirmed",
  [CleanerTaskStatus.IN_PROGRESS]: "evt-inprogress",
  [CleanerTaskStatus.DONE]: "evt-done",
  [CleanerTaskStatus.CANCELLED]: "evt-cancelled",
};

export const STATUS_LABEL: Record<CleaningStatus, string> = {
  [CleanerTaskStatus.ASSIGNED]: "Assigned",
  [CleanerTaskStatus.CONFIRMED]: "Confirmed",
  [CleanerTaskStatus.IN_PROGRESS]: "In progress",
  [CleanerTaskStatus.DONE]: "Done",
  [CleanerTaskStatus.CANCELLED]: "Cancelled",
};

const DEFAULT_PROPERTY = "All properties";

function toEventInput(event: CleanerCalendarEventView): EventInput {
  if (event.kind === "availability") {
    return {
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      allDay: event.allDay,
      classNames: ["evt-booking", "evt-availability"],
      extendedProps: { kind: "availability" },
    };
  }

  const status = event.cleaningStatus ?? CleanerTaskStatus.ASSIGNED;
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

export function CleanerCalendar() {
  const calendarRef = useRef<FullCalendar | null>(null);
  const { data, isLoading } = useCleanerCalendarData();

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
          note: `${e.clientName ?? "Client"} · ${STATUS_LABEL[e.cleaningStatus ?? CleanerTaskStatus.ASSIGNED]}`,
          status: String(e.cleaningStatus ?? CleanerTaskStatus.ASSIGNED),
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
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
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

        <div className="flex flex-wrap items-center gap-4 px-1 pb-1 text-sm text-slate-500">
          <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#6366f1]" />Assigned</span>
          <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#0ea5e9]" />Confirmed</span>
          <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />In progress</span>
          <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#22c55e]" />Done</span>
          <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#ef4444]" />Cancelled</span>
          <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#b8c1d0]" />Availability</span>
        </div>
      </section>

      <aside className="space-y-4">
        <UpcomingCleanings items={upcoming} />
      </aside>
    </div>
  );
}
