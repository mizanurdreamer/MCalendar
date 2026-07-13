import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, Users, Sparkles, Sun, Link2 } from "lucide-react";
import type { Role } from "@/models/view";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const SUPER_ADMIN_NAV: NavItem[] = [
  { label: "Overview", href: "/dashboard/super-admin", icon: LayoutDashboard },
  { label: "Clients", href: "/dashboard/super-admin/clients", icon: Users },
  { label: "Cleaners", href: "/dashboard/super-admin/cleaners", icon: Sparkles },
];

const CLIENT_NAV: NavItem[] = [
  { label: "Today", href: "/dashboard/client", icon: Sun },
  { label: "Cleaners", href: "/dashboard/client/cleaners", icon: Sparkles },
  {
    label: "Booking Endpoints",
    href: "/dashboard/client/booking-endpoints",
    icon: Link2,
  },
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
