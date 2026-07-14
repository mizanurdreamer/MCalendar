import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PROPERTIES, type PropertyFilter } from "@/dto/booking-calendar";
import type { CalendarViewMode } from "@/components/calendar/calendar-grid";

type Direction = "prev" | "next";

type CalendarToolbarProps = {
  title: string;
  viewMode: CalendarViewMode;
  activeProperty: PropertyFilter;
  onChangeProperty: (property: PropertyFilter) => void;
  onNavigate: (direction: Direction) => void;
  onViewModeChange: (mode: CalendarViewMode) => void;
};

export function CalendarToolbar({
  title,
  viewMode,
  activeProperty,
  onChangeProperty,
  onNavigate,
  onViewModeChange,
}: CalendarToolbarProps) {
  const heading = viewMode === "month" ? (title.split(" ")[0] ?? title) : title;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5 md:gap-3">
        <h2 className="text-5xl font-extrabold tracking-tight text-slate-900">
          {heading}
        </h2>
        <div className="inline-flex items-center gap-1 rounded-full p-1">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => onNavigate("prev")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => onNavigate("next")}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="ml-auto flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
          <Input
            placeholder="Search guests, properties..."
            className="h-12 w-full rounded-2xl border-slate-300 bg-white text-[17px] sm:w-[290px]"
          />
          <div className="inline-flex items-center rounded-2xl bg-slate-200 p-1">
            <Button
              size="sm"
              variant={viewMode === "month" ? "default" : "ghost"}
              className={cn(
                "h-10 rounded-xl px-5 text-[17px] font-semibold",
                viewMode !== "month" && "text-slate-600",
              )}
              onClick={() => onViewModeChange("month")}
            >
              Month
            </Button>
            <Button
              size="sm"
              variant={viewMode === "week" ? "default" : "ghost"}
              className={cn(
                "h-10 rounded-xl px-5 text-[17px] font-semibold",
                viewMode !== "week" && "text-slate-600",
              )}
              onClick={() => onViewModeChange("week")}
            >
              Week
            </Button>
            <Button
              size="sm"
              variant={viewMode === "day" ? "default" : "ghost"}
              className={cn(
                "h-10 rounded-xl px-5 text-[17px] font-semibold",
                viewMode !== "day" && "text-slate-600",
              )}
              onClick={() => onViewModeChange("day")}
            >
              Day
            </Button>
          </div>
          <Button className="h-12 rounded-2xl px-5 text-[17px] font-semibold">
            <Plus className="mr-1 h-4 w-4" />
            New booking
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="inline-flex min-w-full gap-2 pr-1">
          {PROPERTIES.map((property) => (
            <Badge
              key={property}
              variant={activeProperty === property ? "default" : "secondary"}
              className={cn(
                "cursor-pointer whitespace-nowrap rounded-2xl border px-5 py-2.5 text-[17px] font-semibold",
                activeProperty === property
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
              onClick={() => onChangeProperty(property)}
            >
              {property}
            </Badge>
          ))}
        </div>
      </div>
    </>
  );
}
