import { requireRole } from "@/lib/auth";
import { RoomAttendantCalendar } from "@/components/calendar/roomAttendant-calendar";

export default async function RoomAttendantCalendarPage() {
  await requireRole("ROOMATTENDATNT");
  return (
    <div className="flex h-full flex-col gap-4">
      <RoomAttendantCalendar />
    </div>
  );
}
