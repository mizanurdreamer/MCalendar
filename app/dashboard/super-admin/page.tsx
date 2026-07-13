import { requireRole } from "@/lib/auth";
import { statsService } from "@/services/StatsService";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCards } from "@/components/dashboard/stat-cards";

export default async function SuperAdminOverview() {
  const user = await requireRole("SUPER_ADMIN");
  const stats = await statsService.superAdmin();

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user.firstName}`}
        description="Platform-wide operations at a glance."
      />
      <StatCards stats={stats} />
    </div>
  );
}
