import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  Sparkles,
  Sun,
  Link2,
  MessageSquareText,
  SendHorizontal,
  CalendarDays,
  CalendarClock,
} from "lucide-react";
import type { Role } from "@/models/view";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
};

const SUPER_ADMIN_NAV: NavItem[] = [
  { label: "Overview", href: "/admin/dashboard", icon: LayoutDashboard, exact: true },
  { label: "Clients", href: "/admin/clients", icon: Users },
  { label: "Room Attendants", href: "/admin/room-attendants", icon: Sparkles },
  { label: "SMS Gateways", href: "/admin/sms-gateways", icon: MessageSquareText },
  { label: "SMS Demo", href: "/admin/sms-demo", icon: SendHorizontal },
];

const CLIENT_NAV: NavItem[] = [
  // { label: "Today", href: "/client/today", icon: Sun, exact: true },
  { label: "Activity Calendar", href: "/client/calendar", icon: CalendarDays },
  {
    label: "Booking Providers",
    href: "/client/booking-providers",
    icon: Link2,
  },
  { label: "Room Attendants", href: "/client/room-attendants", icon: Sparkles },
];

const ROOM_ATTENDANT_NAV: NavItem[] = [
  { label: "Task Schedule", href: "/room-attendant/task-schedule", icon: Sun, exact: true },
  { label: "Activity Calendar", href: "/room-attendant/calendar", icon: CalendarDays },
  { label: "Availability", href: "/room-attendant/availability", icon: CalendarClock }
];

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  SUPER_ADMIN: SUPER_ADMIN_NAV,
  CLIENT: CLIENT_NAV,
  ROOM_ATTENDANT: ROOM_ATTENDANT_NAV,
};

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  CLIENT: "Client",
  ROOM_ATTENDANT: "Room Attendant",
};
