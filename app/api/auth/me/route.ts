import { authService } from "@/services/AuthService";
import { ok, handleApiError } from "@/lib/response";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  try {
    const session = await requireAuth();
    const user = await authService.me(session.sub);
    return ok({ user });
  } catch (error) {
    return handleApiError(error);
  }
}
