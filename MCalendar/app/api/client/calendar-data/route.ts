import { ok, handleApiError } from "@/util/response";
import { requireActor } from "@/util/auth";
import { UserRole } from "@/util/enums/UserRole";
import { clientCalendarService } from "@/services/ClientCalendarService";

export async function GET() {
  try {
    const actor = await requireActor(UserRole.CLIENT);
    const data = await clientCalendarService.getCalendarData(actor);
    return ok(data);
  } catch (error) {
    return handleApiError(error);
  }
}
