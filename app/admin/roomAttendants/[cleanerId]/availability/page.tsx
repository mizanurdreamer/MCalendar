import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { RoomAttendantAvailabilityManager } from "@/components/sections/roomAttendant-availability-manager";

export default async function RoomAttendantAvailabilityScreen({
  params,
}: {
  params: Promise<{ roomAttendantId: string }>;
}) {
  await requireRole("SUPER_ADMIN");
  const { roomAttendantId } = await params;

  return (
    <div className="space-y-4">
      <Link
<<<<<<< HEAD:app/admin/roomAttendants/[cleanerId]/availability/page.tsx
        href="/admin/roomAttendants"
        aria-label="Back to roomAttendants"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
=======
        href="/admin/cleaners"
        aria-label="Back to cleaners"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
>>>>>>> 70775190310bdfd1f11d587cb2bb8bca6d7e9956:app/admin/cleaners/[cleanerId]/availability/page.tsx
      >
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <RoomAttendantAvailabilityManager roomAttendantId={roomAttendantId} />
    </div>
  );
}
