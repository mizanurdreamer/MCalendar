import { requireRole } from "@/util/auth";
import { UserRole } from "@/util/enums/UserRole";
import { RoomAttendantAvailabilityManager } from "@/components/sections/room-attendant-availability-manager";

export default async function RoomAttendantAvailabilityPage() {
  await requireRole(UserRole.ROOM_ATTENDANT);
  return <RoomAttendantAvailabilityManager />;
}
