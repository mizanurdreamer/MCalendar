import { ok, handleApiError } from "@/lib/response";
import { requireActor } from "@/lib/auth";
import { roomAttendantTaskScheduleService } from "@/services/RoomAttendantTaskScheduleService";

export async function GET() {
  try {
    const actor = await requireActor("ROOMATTENDATNT");
    const data = await roomAttendantTaskScheduleService.getRoomAttendantCalendarData(actor);
    return ok(data);
  } catch (error) {
    return handleApiError(error);
  }
}
