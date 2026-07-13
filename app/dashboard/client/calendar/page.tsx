import { requireRole } from "@/lib/auth";
import { BookingCalendar } from "@/components/booking-calendar";

export default async function ClientCalendarPage() {
  await requireRole("CLIENT");

  return (
    <div className="flex h-full flex-col gap-4">
      <BookingCalendar />
    </div>
  );
}
