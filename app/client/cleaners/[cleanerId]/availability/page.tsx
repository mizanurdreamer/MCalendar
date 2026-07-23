import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { CleanerAvailabilityManager } from "@/components/sections/cleaner-availability-manager";

export default async function ClientCleanerAvailabilityScreen({
  params,
}: {
  params: Promise<{ cleanerId: string }>;
}) {
  await requireRole("CLIENT");
  const { cleanerId } = await params;

  return (
    <div className="space-y-4">
      <Link
        href="/client/cleaners"
        aria-label="Back to cleaners"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <CleanerAvailabilityManager cleanerId={cleanerId} />
    </div>
  );
}
