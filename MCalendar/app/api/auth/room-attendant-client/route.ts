import { NextRequest } from "next/server";
import { z } from "zod";
import { authService } from "@/services/AuthService";
import { handleApiError, ok } from "@/util/response";
import { requireActor, setAuthCookies, setRoomAttendantSelectionRequired } from "@/util/auth";
import { UserRole } from "@/util/enums/UserRole";

const selectSchema = z.object({
  userId: z.string().uuid(),
});

export async function GET() {
  try {
    const actor = await requireActor(UserRole.ROOM_ATTENDANT);
    const me = await authService.me(actor.userId);
    const options = await authService.listRoomAttendantLoginOptionsByEmail(me.email);
    return ok({ options });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireActor(UserRole.ROOM_ATTENDANT);
    const dto = selectSchema.parse(await req.json());
    const result = await authService.switchRoomAttendantSession(actor.userId, dto.userId);

    const response = ok({ user: result.user });
    const withCookies = setAuthCookies(response, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
    return setRoomAttendantSelectionRequired(withCookies, false);
  } catch (error) {
    return handleApiError(error);
  }
}
