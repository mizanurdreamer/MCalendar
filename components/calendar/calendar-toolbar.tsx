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
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl md:text-5xl">
          {heading}
        </h2>
        <div className="inline-flex items-center gap-1 rounded-full border bg-background p-1">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => onNavigate("prev")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => onNavigate("next")}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="ml-auto flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
          <Input placeholder="Search guests, properties..." className="h-10 w-full rounded-full sm:w-[280px]" />
          <div className="inline-flex items-center rounded-full border bg-muted/30 p-1">
            <Button
              size="sm"
              variant={viewMode === "month" ? "default" : "ghost"}
              className={cn("h-8 rounded-full px-4 text-sm", viewMode !== "month" && "text-muted-foreground")}
              onClick={() => onViewModeChange("month")}
            >
              Month
            </Button>
            <Button
              size="sm"
              variant={viewMode === "week" ? "default" : "ghost"}
              className={cn("h-8 rounded-full px-4 text-sm", viewMode !== "week" && "text-muted-foreground")}
              onClick={() => onViewModeChange("week")}
            >
              Week
            </Button>
            <Button
              size="sm"
              variant={viewMode === "day" ? "default" : "ghost"}
              className={cn("h-8 rounded-full px-4 text-sm", viewMode !== "day" && "text-muted-foreground")}
              onClick={() => onViewModeChange("day")}
            >
              Day
            </Button>
          </div>
          <Button className="h-10 rounded-full px-4">
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
                "cursor-pointer whitespace-nowrap rounded-full px-4 py-2 text-sm",
                activeProperty === property
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground",
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
