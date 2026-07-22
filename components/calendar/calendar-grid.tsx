import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { CalendarApi, EventContentArg, EventInput } from "@fullcalendar/core";
import type { MutableRefObject } from "react";
import { cn } from "@/lib/utils";

export type CalendarViewMode = "month" | "week" | "day";

const VIEW_NAME: Record<CalendarViewMode, "dayGridMonth" | "dayGridWeek" | "dayGridDay"> = {
  month: "dayGridMonth",
  week: "dayGridWeek",
  day: "dayGridDay",
};

function BookingEvent({ event }: EventContentArg) {
  if (event.classNames.includes("evt-cleaning")) {
    return <span className="text-xs font-semibold">{`* ${event.title}`}</span>;
  }

  if (event.classNames.includes("evt-availability")) {
    return (
      <span className="inline-flex items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
        {event.title}
      </span>
    );
  }

  const status = event.extendedProps?.cleaningStatus as string | undefined;
  const guest = event.title[0] ?? "G";
  return (
    <span className="inline-flex items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold">
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/20 text-[11px] font-bold uppercase">
        {guest}
      </span>
      {event.title}
      {/* {status && status !== "ASSIGNED" && (
        <span className="ml-auto rounded-full bg-white/30 px-1.5 text-[10px] font-bold uppercase tracking-wide">
          {status.replace("_", " ")}
        </span>
      )} */}
    </span>
  );
}

type CalendarGridProps = {
  calendarRef: MutableRefObject<FullCalendar | null>;
  events: EventInput[];
  onDateTitleChange: (title: string) => void;
  initialDate: string;
  viewMode: CalendarViewMode;
};

export function CalendarGrid({ calendarRef, events, onDateTitleChange, initialDate, viewMode }: CalendarGridProps) {
  return (
    <div className="booking-fc space-y-4 rounded-3xl border p-3 shadow-sm">
      <div className="overflow-x-auto">
        <div
          className={cn(
            "min-w-[760px] lg:min-w-0",
            viewMode === "day" && "min-w-[420px] lg:min-w-0",
          )}
        >
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            initialDate={initialDate}
            contentHeight="auto"
            aspectRatio={viewMode === "month" ? 2.0 : 1.8}
            headerToolbar={false}
            fixedWeekCount={false}
            dayMaxEventRows={4}
            events={events}
            eventContent={(arg) => <BookingEvent {...arg} />}
            datesSet={(arg) => onDateTitleChange(arg.view.title)}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 px-1 pb-1 text-sm text-slate-500">
        <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#2563eb]" />Confirmed</span>
        <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#22c55e]" />Checked in</span>
        <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />Pending</span>
        <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#b8c1d0]" />Checked out</span>
        <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#ef4444]" />Cancelled</span>
        <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#7c3aed]" />* Cleaning (checkout day)</span>
      </div>
    </div>
  );
}

export function moveCalendar(calendarRef: MutableRefObject<FullCalendar | null>, direction: "prev" | "next") {
  const api: CalendarApi | undefined = calendarRef.current?.getApi();
  if (!api) return null;
  if (direction === "prev") api.prev();
  else api.next();
  return api.view.title;
}

export function changeCalendarView(calendarRef: MutableRefObject<FullCalendar | null>, mode: CalendarViewMode) {
  const api: CalendarApi | undefined = calendarRef.current?.getApi();
  if (!api) return null;
  api.changeView(VIEW_NAME[mode]);
  return api.view.title;
}
