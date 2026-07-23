import { redirect } from "next/navigation";
import { getCurrentUser, dashboardPathForRole } from "@/util/auth";
import { UserRole } from "@/util/enums/UserRole";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== UserRole.CLIENT) redirect(dashboardPathForRole(user.role));

  return (
    <DashboardShell
      user={{
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
      }}
    >
      {children}
    </DashboardShell>
  );
}
