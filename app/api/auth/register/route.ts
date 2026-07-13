import { NextRequest } from "next/server";
import { authService } from "@/services/AuthService";
import { registerSchema } from "@/dto/auth.dto";
import { created, handleApiError } from "@/lib/response";
import { setAuthCookies } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const dto = registerSchema.parse(body);
    const result = await authService.register(dto);

    const response = created({ user: result.user });
    return setAuthCookies(response, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
