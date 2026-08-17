import { userService } from "@/services/UserService";
import { ok, handleApiError } from "@/util/response";
import { requireActor } from "@/util/auth";
import { UserRole } from "@/util/enums/UserRole";

// Client list for owner-assignment (super admin only).
export async function GET() {
  try {
    await requireActor(UserRole.SUPER_ADMIN);
    const clients = await userService.listClients();
    return ok(clients);
  } catch (error) {
    return handleApiError(error);
  }
}
