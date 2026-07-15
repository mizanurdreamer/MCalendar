"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X, Moon, PanelLeftClose, PanelLeftOpen, UserCircle2 } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { NAV_BY_ROLE, type NavItem } from "@/components/dashboard/nav";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLogout } from "@/hooks/use-auth";
import type { Role } from "@/models/view";

type SessionUser = {
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
};

function NavLinks({
  items,
  collapsed,
  onNavigate,
}: {
  items: NavItem[];
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 px-2">
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg font-medium transition-colors",
              collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5 text-sm",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function DashboardShell({
  user,
  children,
  rightPanel,
  bottomNav,
}: {
  user: SessionUser;
  children: React.ReactNode;
  rightPanel?: React.ReactNode;
  bottomNav?: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);
  const logout = useLogout();
  const items = NAV_BY_ROLE[user.role];
  const profileHrefByRole: Partial<Record<Role, string>> = {
    CLIENT: "/client/profile",
    CLEANER: "/cleaner/profile",
  };
  const profileHref = profileHrefByRole[user.role];

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r bg-background transition-all duration-200 lg:flex",
          collapsed ? "w-[60px]" : "w-60",
        )}
      >
        {/* Header */}
        <div
          className={cn(
            "flex h-14 items-center border-b",
            collapsed ? "justify-center px-2" : "justify-between px-4",
          )}
        >
          {!collapsed && (
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
                {user.firstName[0]}
              </div>
              <span className="text-sm font-semibold">bookingCalendar</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
          </Button>
        </div>

        {/* Nav */}
        <div className="flex flex-1 flex-col justify-between py-3">
          <NavLinks items={items} collapsed={collapsed} />

          <div className="flex flex-col gap-1">
            {bottomNav && (
              <div className={cn("pb-1", collapsed ? "flex justify-center" : "px-2")}>
                {bottomNav}
              </div>
            )}

            {/* Dark mode */}
            <button
              className={cn(
                "flex items-center rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                collapsed ? "justify-center px-2 py-2.5" : "mx-2 gap-3 px-3 py-2.5",
              )}
              title={collapsed ? "Dark mode" : undefined}
            >
              <Moon className="h-4 w-4" />
              {!collapsed && <span>Dark mode</span>}
            </button>

            {/* User */}
            <div
              className={cn(
                "flex items-center rounded-lg",
                collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
              )}
            >
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="text-xs">
                  {initials(user.firstName, user.lastName)}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="flex flex-col">
                  <span className="text-sm font-medium leading-none">
                    {user.firstName} {user.lastName}
                  </span>
                  <span className="text-xs text-muted-foreground">{user.email}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-60 flex-col border-r bg-background">
            <div className="flex h-14 items-center justify-between border-b px-4">
              <span className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
                  {user.firstName[0]}
                </div>
                <span className="text-sm font-semibold">bookingCalendar</span>
              </span>
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 py-3">
              <NavLinks
                items={items}
                collapsed={false}
                onNavigate={() => setMobileOpen(false)}
              />
            </div>
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:px-6">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">
                    {initials(user.firstName, user.lastName)}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden text-sm font-medium sm:block">
                  {user.firstName} {user.lastName}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span>
                    {user.firstName} {user.lastName}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {user.email}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {profileHref && (
                <DropdownMenuItem asChild>
                  <Link href={profileHref}>
                    <UserCircle2 className="h-4 w-4" />
                    Profile
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => logout.mutate()}
                className="text-destructive"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <main className="flex-1 overflow-auto p-4 lg:p-6">{children}</main>
          {rightPanel && (
            <aside className="hidden w-72 shrink-0 border-l bg-background p-4 xl:block">
              {rightPanel}
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
