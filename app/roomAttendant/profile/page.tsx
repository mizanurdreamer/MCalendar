import { requireRole } from "@/lib/auth";
import { RoomAttendantProfileSection } from "@/components/profile/roomAttendant-profile-section";

export default async function RoomAttendantProfilePage() {
  await requireRole("ROOMATTENDATNT");
  return <RoomAttendantProfileSection />;
}
