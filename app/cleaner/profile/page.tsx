import { requireRole } from "@/lib/auth";
import { CleanerProfileSection } from "@/components/profile/cleaner-profile-section";

export default async function CleanerProfilePage() {
  await requireRole("CLEANER");
  return <CleanerProfileSection />;
}
