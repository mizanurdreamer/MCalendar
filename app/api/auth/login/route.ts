import { NextRequest } from "next/server";
import { authService } from "@/services/AuthService";
import { loginSchema } from "@/dto/auth.dto";
import { ok, handleApiError } from "@/util/response";
import { setAuthCookies, setRoomAttendantSelectionRequired } from "@/util/auth";
import { UserRole } from "@/util/enums/UserRole";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const dto = loginSchema.parse(body);
    const result = await authService.login(dto);
    const roomAttendantOptions =
      result.user.role === UserRole.ROOM_ATTENDANT
        ? await authService.listRoomAttendantLoginOptionsByEmail(result.user.email)
        : [];

    const response = ok({ user: result.user });
    const responseWithAuth = setAuthCookies(response, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
    if (result.user.role === UserRole.ROOM_ATTENDANT) {
      return setRoomAttendantSelectionRequired(responseWithAuth, roomAttendantOptions.length > 1);
    }
    return responseWithAuth;
  } catch (error) {
    return handleApiError(error);
  }
}
