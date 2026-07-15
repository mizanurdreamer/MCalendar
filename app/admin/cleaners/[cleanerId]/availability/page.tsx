import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { CleanerAvailabilityView } from "@/components/sections/cleaner-availability-view";

export default async function CleanerAvailabilityScreen({
  params,
}: {
  params: Promise<{ cleanerId: string }>;
}) {
  await requireRole("SUPER_ADMIN");
  const { cleanerId } = await params;

  return (
    <div className="space-y-4">
      <Link
        href="/admin/cleaners"
        aria-label="Back to cleaners"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
      >
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <CleanerAvailabilityView cleanerId={cleanerId} />
    </div>
  );
}
