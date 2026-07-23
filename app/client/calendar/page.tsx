import { requireRole } from "@/util/auth";
import { UserRole } from "@/util/enums/UserRole";
import { BookingCalendar } from "@/components/calendar";
export default async function ClientCalendarPage() {
  await requireRole(UserRole.CLIENT);
  return (
    <div className="flex h-full flex-col gap-4">
      <BookingCalendar />
    </div>
  );
}
