import { redirect } from "next/navigation";
import { getCurrentUser, dashboardPathForRole } from "@/lib/auth";

export default async function DashboardIndex() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(dashboardPathForRole(user.role));
}
