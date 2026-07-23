import { ok, handleApiError } from "@/util/response";
import { requireActor } from "@/util/auth";
import { UserRole } from "@/util/enums/UserRole";
import { roomAttendantTaskScheduleService } from "@/services/RoomAttendantTaskScheduleService";

export async function GET() {
  try {
    const actor = await requireActor(UserRole.ROOM_ATTENDANT);
    const data = await roomAttendantTaskScheduleService.getRoomAttendantCalendarData(actor);
    return ok(data);
  } catch (error) {
    return handleApiError(error);
  }
}
