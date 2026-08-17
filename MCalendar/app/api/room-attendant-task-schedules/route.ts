import { NextRequest } from "next/server";
import { roomAttendantTaskScheduleService } from "@/services/RoomAttendantTaskScheduleService";
import { parseListParams } from "@/dto/common.dto";
import { created, ok, handleApiError } from "@/util/response";
import { requireActor } from "@/util/auth";
import { UserRole } from "@/util/enums/UserRole";
import { z } from "zod";

const createTaskScheduleSchema = z.object({
  clientId: z.string().uuid(),
  roomAttendantId: z.string().uuid(),
  assignedDate: z.string().datetime(),
});

export async function GET(req: NextRequest) {
  try {
    const actor = await requireActor(UserRole.SUPER_ADMIN, UserRole.CLIENT, UserRole.ROOM_ATTENDANT);
    const params = parseListParams(req.nextUrl.searchParams);
    const clientId = req.nextUrl.searchParams.get("clientId") ?? undefined;
    const roomAttendantId = req.nextUrl.searchParams.get("roomAttendantId") ?? undefined;
    const activeOnly = req.nextUrl.searchParams.get("activeOnly") === "true";

    const result = await roomAttendantTaskScheduleService.list(
      { ...params, clientId, roomAttendantId, activeOnly },
      actor,
    );
    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireActor(UserRole.SUPER_ADMIN, UserRole.CLIENT);
    const body = await req.json();
    const dto = createTaskScheduleSchema.parse(body);

    const result = await roomAttendantTaskScheduleService.create(
      {
        clientId: dto.clientId,
        roomAttendantId: dto.roomAttendantId,
        assignedDate: new Date(dto.assignedDate),
      },
      actor,
    );
    return created(result);
  } catch (error) {
    return handleApiError(error);
  }
}
