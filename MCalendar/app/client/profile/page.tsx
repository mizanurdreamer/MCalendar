import { requireRole } from "@/util/auth";
import { UserRole } from "@/util/enums/UserRole";
import { ClientProfileSection } from "@/components/profile/client-profile-section";

export default async function ClientProfilePage() {
  await requireRole(UserRole.CLIENT);
  return <ClientProfileSection />;
}
