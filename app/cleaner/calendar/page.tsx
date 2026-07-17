import { requireRole } from "@/lib/auth";
import { CleanerCalendar } from "@/components/calendar/cleaner-calendar";

export default async function CleanerCalendarPage() {
  await requireRole("CLEANER");
  return (
    <div className="flex h-full flex-col gap-4">
      <CleanerCalendar />
    </div>
  );
}
