import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
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
      role="CLEANER"
      canCreate
      canDelete
      availabilityBasePath="/client/cleaners"
      clientId={clientProfile?.id}
    />
  );
}
