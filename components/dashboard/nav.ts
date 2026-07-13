import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, Users, CalendarDays, Sun } from "lucide-react";
import type { Role } from "@/models/view";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const SUPER_ADMIN_NAV: NavItem[] = [
  { label: "Overview", href: "/dashboard/super-admin", icon: LayoutDashboard },
  { label: "Users", href: "/dashboard/super-admin/users", icon: Users },
];

const CLIENT_NAV: NavItem[] = [
  { label: "Today", href: "/dashboard/client/today", icon: Sun },
  { label: "Calendar", href: "/dashboard/client/calendar", icon: CalendarDays },
];

const CLEANER_NAV: NavItem[] = [
  { label: "Overview", href: "/dashboard/cleaner", icon: LayoutDashboard },
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
