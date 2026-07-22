import { requireRole } from "@/lib/auth";
import { CleanerAssignmentSection } from "@/components/sections/cleaner-assignment-section";

export default async function ClientCleanerAssignmentsPage() {
  await requireRole("CLIENT");
  return (
    <div className="space-y-4">
      <CleanerAssignmentSection />
    </div>
  );
}
