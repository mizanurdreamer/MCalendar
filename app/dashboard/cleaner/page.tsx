import { requireRole } from "@/lib/auth";
import { statsService } from "@/services/StatsService";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCards } from "@/components/dashboard/stat-cards";

export default async function CleanerOverview() {
  const user = await requireRole("CLEANER");
  const stats = await statsService.cleaner({ userId: user.sub, role: user.role });

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user.firstName}`}
        description="Your dashboard at a glance."
      />
      <StatCards stats={stats} />
    </div>
  );
}
