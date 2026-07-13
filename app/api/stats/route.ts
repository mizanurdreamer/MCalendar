import { statsService } from "@/services/StatsService";
import { ok, handleApiError } from "@/lib/response";
import { requireRole } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireRole("SUPER_ADMIN", "CLIENT", "CLEANER");
    let stats;
    switch (user.role) {
      case "SUPER_ADMIN":
        stats = await statsService.superAdmin();
        break;
      case "CLIENT":
        stats = await statsService.client({ userId: user.sub, role: user.role });
        break;
      case "CLEANER":
        stats = await statsService.cleaner({ userId: user.sub, role: user.role });
        break;
    }
    return ok(stats);
  } catch (error) {
    return handleApiError(error);
  }
}
