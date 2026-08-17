import { authService } from "@/services/AuthService";
import { ok, handleApiError } from "@/util/response";
import { requireAuth } from "@/util/auth";

export async function GET() {
  try {
    const session = await requireAuth();
    const user = await authService.me(session.sub);
    return ok({ user });
  } catch (error) {
    return handleApiError(error);
  }
}
