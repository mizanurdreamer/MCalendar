import { NextRequest } from "next/server";
import { authService } from "@/services/AuthService";
import { ok, handleApiError } from "@/util/response";
import { setAuthCookies } from "@/util/auth";
import { REFRESH_COOKIE } from "@/util/jwt";

export async function POST(req: NextRequest) {
  try {
    const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
    const result = await authService.refresh(refreshToken);

    const response = ok({ user: result.user });
    return setAuthCookies(response, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
