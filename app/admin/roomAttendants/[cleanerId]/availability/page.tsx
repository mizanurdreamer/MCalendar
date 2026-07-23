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
        href="/admin/roomAttendants"
        aria-label="Back to roomAttendants"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <RoomAttendantAvailabilityManager roomAttendantId={roomAttendantId} />
    </div>
  );
}
