import { ok, handleApiError } from "@/lib/response";
import { requireActor } from "@/lib/auth";
import { cleanerTaskScheduleService } from "@/services/CleanerTaskScheduleService";

export async function GET() {
  try {
    const actor = await requireActor("CLEANER");
    const data = await cleanerTaskScheduleService.getCleanerCalendarData(actor);
    return ok(data);
  } catch (error) {
    return handleApiError(error);
  }
}
