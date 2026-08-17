import { prisma } from "@/util/prisma";
import { getCurrentUser } from "@/util/auth";
import { redirect } from "next/navigation";
import { UserRole } from "@/util/enums/UserRole";
import { UsersSection } from "@/components/sections/users-section";

export default async function Page() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const clientProfile = await prisma.clientProfile.findUnique({
    where: { userId: currentUser.sub },
    select: { id: true },
  });

  return (
    <UsersSection
      role={UserRole.ROOM_ATTENDANT}
      canCreate
      canDelete
      availabilityBasePath="/client/room-attendants"
      clientId={clientProfile?.id}
    />
  );
}
