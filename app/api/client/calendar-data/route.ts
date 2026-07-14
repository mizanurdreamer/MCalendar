import { ok, handleApiError } from "@/lib/response";
import { requireActor } from "@/lib/auth";
import { clientCalendarService } from "@/services/ClientCalendarService";

export async function GET() {
  try {
    const actor = await requireActor("CLIENT");
    const data = await clientCalendarService.getCalendarData(actor);
    return ok(data);
  } catch (error) {
    return handleApiError(error);
  }
}
