import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  Sparkles,
  Sun,
  Link2,
  CalendarDays,
  UserCircle2,
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
  { label: "Cleaners", href: "/admin/cleaners", icon: Sparkles },
];

const CLIENT_NAV: NavItem[] = [
  { label: "Today", href: "/client/today", icon: Sun, exact: true },
  { label: "Calendar", href: "/client/calendar", icon: CalendarDays },
  { label: "Profile", href: "/client/profile", icon: UserCircle2 },
  {
    label: "Booking Endpoints",
    href: "/client/booking-endpoints",
    icon: Link2,
  },
  { label: "Cleaners", href: "/client/cleaners", icon: Sparkles }
];

const CLEANER_NAV: NavItem[] = [
  { label: "Today", href: "/cleaner/today", icon: Sun, exact: true },
  { label: "Profile", href: "/cleaner/profile", icon: UserCircle2 },
];

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  SUPER_ADMIN: SUPER_ADMIN_NAV,
  CLIENT: CLIENT_NAV,
  CLEANER: CLEANER_NAV,
};

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  CLIENT: "Client",
  CLEANER: "Cleaner",
};
