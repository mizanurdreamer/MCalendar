import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/util/auth";
import { UserRole } from "@/util/enums/UserRole";
import { RoomAttendantAvailabilityManager } from "@/components/sections/room-attendant-availability-manager";

export default async function ClientRoomAttendantAvailabilityScreen({
  params,
}: {
  params: Promise<{ roomAttendantId: string }>;
}) {
  await requireRole(UserRole.CLIENT);
  const { roomAttendantId } = await params;

  return (
    <div className="space-y-4">
      <Link
        href="/client/room-attendants"
        aria-label="Back to Room Attendants"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <RoomAttendantAvailabilityManager roomAttendantId={roomAttendantId} />
    </div>
  );
}
