import { NextRequest } from "next/server";
import { authService } from "@/services/AuthService";
import { ok, handleApiError } from "@/lib/response";
import { clearAuthCookies } from "@/lib/auth";
import { REFRESH_COOKIE } from "@/lib/jwt";

export async function POST(req: NextRequest) {
  try {
    const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
    await authService.logout(refreshToken);

    const response = ok({ message: "Logged out" });
    return clearAuthCookies(response);
  } catch (error) {
    return handleApiError(error);
  }
}
