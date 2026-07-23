import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { RoomAttendantAvailabilityManager } from "@/components/sections/roomAttendant-availability-manager";

export default async function ClientRoomAttendantAvailabilityScreen({
  params,
}: {
  params: Promise<{ roomAttendantId: string }>;
}) {
  await requireRole("CLIENT");
  const { roomAttendantId } = await params;

  return (
    <div className="space-y-4">
      <Link
<<<<<<< HEAD:app/client/roomAttendants/[roomAttendantId]/availability/page.tsx
        href="/client/roomAttendants"
        aria-label="Back to roomAttendants"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
=======
        href="/client/cleaners"
        aria-label="Back to cleaners"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
>>>>>>> 70775190310bdfd1f11d587cb2bb8bca6d7e9956:app/client/cleaners/[cleanerId]/availability/page.tsx
      >
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <RoomAttendantAvailabilityManager roomAttendantId={roomAttendantId} />
    </div>
  );
}
