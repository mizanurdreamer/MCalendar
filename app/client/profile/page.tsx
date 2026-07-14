import { requireRole } from "@/lib/auth";
import { ClientProfileSection } from "@/components/profile/client-profile-section";

export default async function ClientProfilePage() {
  await requireRole("CLIENT");
  return <ClientProfileSection />;
}
