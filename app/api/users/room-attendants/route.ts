import { NextRequest } from "next/server";
import { userService } from "@/services/UserService";
import { ok, handleApiError } from "@/util/response";
import { requireActor } from "@/util/auth";
import { UserRole } from "@/util/enums/UserRole";

// RoomAttendant list for assignment dropdowns (admins + clients).
export async function GET(req: NextRequest) {
  try {
    await requireActor(UserRole.SUPER_ADMIN, UserRole.CLIENT);
    const clientId = req.nextUrl.searchParams.get("clientId") || undefined;
    const roomAttendants = await userService.listRoomAttendants(clientId);
    return ok(roomAttendants);
  } catch (error) {
    return handleApiError(error);
  }
}
