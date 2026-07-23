import { requireRole } from "@/lib/auth";
import { RoomAttendantAvailabilityManager } from "@/components/sections/roomAttendant-availability-manager";

export default async function RoomAttendantAvailabilityPage() {
  await requireRole("ROOMATTENDATNT");
  return <RoomAttendantAvailabilityManager />;
}
