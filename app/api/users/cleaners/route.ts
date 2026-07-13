import { userService } from "@/services/UserService";
import { ok, handleApiError } from "@/lib/response";
import { requireActor } from "@/lib/auth";

// Cleaner list for assignment dropdowns (admins + clients).
export async function GET() {
  try {
    await requireActor("SUPER_ADMIN", "CLIENT");
    const cleaners = await userService.listCleaners();
    return ok(cleaners);
  } catch (error) {
    return handleApiError(error);
  }
}
