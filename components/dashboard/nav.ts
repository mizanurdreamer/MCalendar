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
  { label: "RoomAttendants", href: "/admin/roomAttendants", icon: Sparkles },
  { label: "SMS Gateways", href: "/admin/sms-gateways", icon: MessageSquareText },
  { label: "SMS Demo", href: "/admin/sms-demo", icon: SendHorizontal },
];

const CLIENT_NAV: NavItem[] = [
  { label: "Today", href: "/client/today", icon: Sun, exact: true },
  { label: "Calendar", href: "/client/calendar", icon: CalendarDays },
  {
    label: "Booking Providers",
    href: "/client/booking-providers",
    icon: Link2,
  },
  { label: "RoomAttendants", href: "/client/roomAttendants", icon: Sparkles },
];

const ROOMATTENDATNT_NAV: NavItem[] = [
  { label: "Today", href: "/roomAttendant/today", icon: Sun, exact: true },
  { label: "Calendar", href: "/roomAttendant/calendar", icon: CalendarDays },
  { label: "Availability", href: "/roomAttendant/availability", icon: CalendarClock }
];

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  SUPER_ADMIN: SUPER_ADMIN_NAV,
  CLIENT: CLIENT_NAV,
  ROOMATTENDATNT: ROOMATTENDATNT_NAV,
};

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  CLIENT: "Client",
  ROOMATTENDATNT: "RoomAttendant",
};
