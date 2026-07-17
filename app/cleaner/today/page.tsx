"use client";

import { useStats } from "@/hooks/use-stats";
import { useMe } from "@/hooks/use-auth";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCards } from "@/components/dashboard/stat-cards";
import { CleanerTodayTasks } from "@/components/sections/cleaner-today-tasks";

export default function CleanerToday() {
  const { data: stats, isLoading } = useStats();
  const { data: me } = useMe();

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Welcome, ${me?.firstName ?? "Cleaner"}`}
        description="Your dashboard at a glance."
      />
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <StatCards stats={stats ?? []} />
      )}
      <CleanerTodayTasks />
    </div>
  );
}
