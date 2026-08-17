import { statsService } from "@/services/StatsService";
import { ok, handleApiError } from "@/util/response";
import { requireRole } from "@/util/auth";
import { UserRole } from "@/util/enums/UserRole";

export async function GET() {
  try {
    const user = await requireRole(UserRole.SUPER_ADMIN, UserRole.CLIENT, UserRole.ROOM_ATTENDANT);
    let stats;
    switch (user.role) {
      case UserRole.SUPER_ADMIN:
        stats = await statsService.superAdmin();
        break;
      case UserRole.CLIENT:
        stats = await statsService.client({ userId: user.sub, role: user.role });
        break;
      case UserRole.ROOM_ATTENDANT:
        stats = await statsService.roomAttendant({ userId: user.sub, role: user.role });
        break;
    }
    return ok(stats);
  } catch (error) {
    return handleApiError(error);
  }
}
