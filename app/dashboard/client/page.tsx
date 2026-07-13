import { requireRole } from "@/lib/auth";
import { statsService } from "@/services/StatsService";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCards } from "@/components/dashboard/stat-cards";

export default async function ClientToday() {
  const user = await requireRole("CLIENT");
  const stats = await statsService.client({ userId: user.sub, role: user.role });

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={`Welcome, ${user.firstName}`}
        description="Your dashboard at a glance."
      />
      <StatCards stats={stats} />
    </div>
  );
}
