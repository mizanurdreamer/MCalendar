import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { CalendarApi, EventContentArg, EventInput } from "@fullcalendar/core";
import type { MutableRefObject } from "react";
import { cn } from "@/util/utils";

export type CalendarViewMode = "month" | "week" | "day";

const VIEW_NAME: Record<CalendarViewMode, "dayGridMonth" | "dayGridWeek" | "dayGridDay"> = {
  month: "dayGridMonth",
  week: "dayGridWeek",
  day: "dayGridDay",
};

function BookingEvent({ event }: EventContentArg) {
  const status = event.extendedProps?.status as string | undefined;

  if (event.classNames.includes("evt-cleaning")) {
    return (
      <span className="text-xs font-semibold">
        <span className="block">{event.title}</span>
        {status && <span className="block">* {status}</span>}
      </span>
    );
  }

  if (event.classNames.includes("evt-availability")) {
    return (
      <span className="inline-flex items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
        {event.title}
      </span>
    );
  }

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
  onDateSelect?: (date: string) => void;
  onEventSelect?: (eventId: string) => void;
  showLegend?: boolean;
  showCalendarHeader?: boolean;
};

export function CalendarGrid({
  calendarRef,
  events,
  onDateTitleChange,
  initialDate,
  viewMode,
  onDateSelect,
  onEventSelect,
  showLegend = true,
  showCalendarHeader = false,
}: CalendarGridProps) {
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
            headerToolbar={
              showCalendarHeader
                ? { left: "title", center: "", right: "prev,next" }
                : false
            }
            fixedWeekCount={false}
            dayMaxEventRows={4}
            events={events}
            eventContent={(arg) => <BookingEvent {...arg} />}
            datesSet={(arg) => onDateTitleChange(arg.view.title)}
            dateClick={(arg) => onDateSelect?.(arg.dateStr)}
            eventClick={(arg) => onEventSelect?.(arg.event.id)}
          />
        </div>
      </div>
      {showLegend && (
        <div className="flex flex-wrap items-center gap-4 px-1 pb-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full legend-dot-blue" />Confirmed</span>
          <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full legend-dot-green" />Checked in</span>
          <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full legend-dot-amber" />Pending</span>
          <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full legend-dot-neutral" />Checked out</span>
          <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full legend-dot-red" />Cancelled</span>
        </div>
      )}
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
