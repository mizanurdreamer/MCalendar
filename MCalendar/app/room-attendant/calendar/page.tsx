import { requireRole } from "@/util/auth";
import { UserRole } from "@/util/enums/UserRole";
import { RoomAttendantCalendar } from "@/components/calendar/room-attendant-calendar";

export default async function RoomAttendantCalendarPage() {
  await requireRole(UserRole.ROOM_ATTENDANT);
  return (
    <div className="flex h-full flex-col gap-4">
      <RoomAttendantCalendar />
    </div>
  );
}
