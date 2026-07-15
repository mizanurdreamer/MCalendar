import { requireRole } from "@/lib/auth";
import { CleanerAvailabilityManager } from "@/components/sections/cleaner-availability-manager";

export default async function CleanerAvailabilityPage() {
  await requireRole("CLEANER");
  return <CleanerAvailabilityManager />;
}
