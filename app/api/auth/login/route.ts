import { NextRequest } from "next/server";
import { authService } from "@/services/AuthService";
import { loginSchema } from "@/dto/auth.dto";
import { ok, handleApiError } from "@/util/response";
import { setAuthCookies } from "@/util/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const dto = loginSchema.parse(body);
    const result = await authService.login(dto);

    const response = ok({ user: result.user });
    return setAuthCookies(response, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
