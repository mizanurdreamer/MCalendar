"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EventInput } from "@fullcalendar/core";
import FullCalendar from "@fullcalendar/react";
import { Loader2 } from "lucide-react";
import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";
import {
  CalendarGrid,
  moveCalendar,
  changeCalendarView,
  type CalendarViewMode,
} from "@/components/calendar/calendar-grid";
import { UpcomingCleanings } from "@/components/calendar/upcoming-cleanings";
import { useCalendarData } from "@/hooks/use-calendar-data";
import type { CalendarEventView } from "@/models/view";

const DEFAULT_PROPERTY = "All properties";

function toEventInput(event: CalendarEventView): EventInput {
  return {
    id: event.id,
    title: event.title,
    start: event.start,
    end: event.end,
    allDay: event.allDay,
    classNames: event.classNames,
    extendedProps: event.extendedProps,
  };
}

export function BookingCalendar() {
  const calendarRef = useRef<FullCalendar | null>(null);
  const { data, isLoading } = useCalendarData();
  const initialDate = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, []);
  const [title, setTitle] = useState(
    () =>
      new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
      }).format(new Date()),
  );
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [activeProperty, setActiveProperty] = useState(DEFAULT_PROPERTY);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const properties = data?.properties ?? [];
    if (!properties.length) return;
    if (!properties.includes(activeProperty)) {
      setActiveProperty(DEFAULT_PROPERTY);
    }
  }, [data?.properties, activeProperty]);

  const events = useMemo(() => {
    const fromApi = data?.events ?? [];
    const normalizedSearch = search.trim().toLowerCase();

    return fromApi
      .filter((event) =>
        activeProperty === DEFAULT_PROPERTY
          ? true
          : event.extendedProps.property === activeProperty,
      )
      .filter((event) => {
        if (!normalizedSearch) return true;
        const haystack = `${event.title} ${event.extendedProps.property}`.toLowerCase();
        return haystack.includes(normalizedSearch);
      })
      .map(toEventInput);
  }, [activeProperty, data?.events, search]);

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
          properties={data?.properties ?? [DEFAULT_PROPERTY]}
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
      </section>

      <aside className="space-y-4">
        <UpcomingCleanings items={data?.upcomingCleanings ?? []} />
      </aside>
    </div>
  );
}
