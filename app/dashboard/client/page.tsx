import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";

export default async function ClientOverview() {
  await requireRole("CLIENT");
  redirect("/dashboard/client/today");
}
