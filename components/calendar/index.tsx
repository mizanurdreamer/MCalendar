"use client";

import { useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import {
  PROPERTIES,
  CALENDAR_EVENTS,
  UPCOMING_CLEANINGS,
} from "@/dto/booking-calendar";
import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";
import {
  CalendarGrid,
  moveCalendar,
  changeCalendarView,
  type CalendarViewMode,
} from "@/components/calendar/calendar-grid";
import { UpcomingCleanings } from "@/components/calendar/upcoming-cleanings";

export function BookingCalendar() {
  const calendarRef = useRef<FullCalendar | null>(null);
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
  const [activeProperty, setActiveProperty] = useState<(typeof PROPERTIES)[number]>("All properties");

  const events = useMemo(() => CALENDAR_EVENTS, []);

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
    <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="space-y-3 md:space-y-4">
        <CalendarToolbar
          title={title}
          viewMode={viewMode}
          activeProperty={activeProperty}
          onChangeProperty={setActiveProperty}
          onNavigate={go}
          onViewModeChange={onViewModeChange}
        />

        <CalendarGrid
          calendarRef={calendarRef}
          events={events}
          onDateTitleChange={setTitle}
          initialDate={initialDate}
          viewMode={viewMode}
        />
      </section>

      <aside className="space-y-4">
        <UpcomingCleanings items={UPCOMING_CLEANINGS} />
      </aside>
    </div>
  );
}
