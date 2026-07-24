import { NextRequest } from "next/server";
import { requireActor } from "@/util/auth";
import { UserRole } from "@/util/enums/UserRole";
import { userService } from "@/services/UserService";
import { ok, handleApiError } from "@/util/response";

export async function GET(req: NextRequest) {
  try {
    await requireActor(UserRole.SUPER_ADMIN, UserRole.CLIENT);
    const email = (req.nextUrl.searchParams.get("email") ?? "").trim().toLowerCase();
    if (!email) return ok({ exists: false });

    const result = await userService.checkEmailExists(email);
    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}
