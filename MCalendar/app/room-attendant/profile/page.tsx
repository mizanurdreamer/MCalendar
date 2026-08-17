import { requireRole } from "@/util/auth";
import { UserRole } from "@/util/enums/UserRole";
import { RoomAttendantProfileSection } from "@/components/profile/room-attendant-profile-section";

export default async function RoomAttendantProfilePage() {
  await requireRole(UserRole.ROOM_ATTENDANT);
  return <RoomAttendantProfileSection />;
}
