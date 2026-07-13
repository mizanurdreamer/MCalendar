import { requireRole } from "@/lib/auth";
import { statsService } from "@/services/StatsService";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCards } from "@/components/dashboard/stat-cards";

export default async function ClientTodayPage() {
  const user = await requireRole("CLIENT");
  const stats = await statsService.client({ userId: user.sub, role: user.role });

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={`Good ${getTimeOfDay()}, ${user.firstName}`}
        description="Here's what's happening across your account today."
      />
      <StatCards stats={stats} />
    </div>
  );
}

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}
