"use client";

import {
  CalendarDays,
  Clock3,
  Home,
  MessageSquare,
  Settings2,
  SlidersHorizontal,
  Shield,
  Sparkles,
} from "lucide-react";
import { useTheme } from "@/util/theme-context";
import { Moon, Sun } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/util/utils";

const MAIN_ITEMS = [
  { label: "Today", icon: Sun, active: false },
  { label: "Calendar", icon: CalendarDays, active: true },
  { label: "Properties", icon: Home, active: false },
  { label: "Booking history", icon: Clock3, active: false },
  { label: "Messages", icon: MessageSquare, active: false },
  { label: "Settings", icon: Settings2, active: false },
];

const ROLE_ITEMS = [
  { label: "Admin view", icon: Shield },
  { label: "RoomAttendant view", icon: Sparkles },
];

export function CalendarMenu() {
  const { theme, toggleTheme } = useTheme();
  return <aside className="hidden rounded-3xl border bg-background p-4 xl:flex xl:min-h-[calc(100vh-9.5rem)] xl:w-[270px] xl:flex-col">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
            T
          </div>
          <div>
            <p className="text-2xl font-extrabold leading-none">TidyHost</p>
          </div>
        </div>
        <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[10px] uppercase">
          Client
        </Badge>
      </div>

      <nav className="mt-6 space-y-2">
        {MAIN_ITEMS.map((item) => (
          <Button
            key={item.label}
            variant="ghost"
            className={cn(
              "h-12 w-full justify-start rounded-xl px-3 text-base",
              item.active
                ? "bg-primary/15 text-foreground hover:bg-primary/20"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <span
              className={cn(
                "mr-3 inline-flex h-8 w-8 items-center justify-center rounded-lg",
                item.active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
            </span>
            {item.label}
          </Button>
        ))}
      </nav>

      <div className="mt-6">
        <p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Switch role</p>
        <div className="mt-2 space-y-2">
          {ROLE_ITEMS.map((item) => (
            <Button
              key={item.label}
              variant="ghost"
              className="h-11 w-full justify-start rounded-xl px-3 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <span className="mr-3 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                <item.icon className="h-4 w-4" />
              </span>
              {item.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-auto space-y-3 pt-6">
        <Button variant="ghost" onClick={toggleTheme} className="h-11 w-full justify-start rounded-xl px-3 text-muted-foreground">
          <span className="mr-3 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </span>
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </Button>
        <Button variant="ghost" className="h-11 w-full justify-start rounded-xl px-3 text-muted-foreground">
          <span className="mr-3 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
            <SlidersHorizontal className="h-4 w-4" />
          </span>
          Preferences
        </Button>
        <div className="flex items-center gap-3 rounded-xl border px-3 py-2">
          <Avatar className="h-10 w-10">
            <AvatarFallback>NW</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Nora Whitfield</p>
            <p className="truncate text-xs text-muted-foreground">Beacon Stays</p>
          </div>
        </div>
      </div>
    </aside>
}
