import { userService } from "@/services/UserService";
import { ok, handleApiError } from "@/lib/response";
import { requireActor } from "@/lib/auth";

// Client list for owner-assignment (super admin only).
export async function GET() {
  try {
    await requireActor("SUPER_ADMIN");
    const clients = await userService.listClients();
    return ok(clients);
  } catch (error) {
    return handleApiError(error);
  }
}
