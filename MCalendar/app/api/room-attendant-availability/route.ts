import { NextRequest } from "next/server";
import { roomAttendantAvailabilityService } from "@/services/RoomAttendantAvailabilityService";
import { parseListParams } from "@/dto/common.dto";
import { created, ok, handleApiError } from "@/util/response";
import { requireActor } from "@/util/auth";
import { UserRole } from "@/util/enums/UserRole";
import { z } from "zod";

const createAvailabilitySchema = z.object({
  clientId: z.string().min(1, "clientId is required"),
  roomAttendantId: z.string().min(1, "roomAttendantId is required"),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
    .optional()
    .nullable(),
  note: z.string().trim().max(500).nullable().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const actor = await requireActor(UserRole.SUPER_ADMIN, UserRole.CLIENT, UserRole.ROOM_ATTENDANT);
    const listParams = parseListParams(req.nextUrl.searchParams);
    const clientId = req.nextUrl.searchParams.get("clientId") ?? undefined;
    const roomAttendantId = req.nextUrl.searchParams.get("roomAttendantId") ?? undefined;
    const activeOnly = req.nextUrl.searchParams.get("activeOnly") === "true";

    const result = await roomAttendantAvailabilityService.list(
      { ...listParams, clientId, roomAttendantId, activeOnly },
      actor,
    );
    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireActor(UserRole.SUPER_ADMIN, UserRole.CLIENT, UserRole.ROOM_ATTENDANT);
    const body = await req.json();
    const dto = createAvailabilitySchema.parse(body);

    const result = await roomAttendantAvailabilityService.create(
      {
        clientId: dto.clientId,
        roomAttendantId: dto.roomAttendantId,
        fromDate: new Date(`${dto.fromDate}T00:00:00.000Z`),
        toDate: dto.toDate ? new Date(`${dto.toDate}T00:00:00.000Z`) : null,
        note: dto.note ?? undefined,
      },
      actor,
    );
    return created(result);
  } catch (error) {
    return handleApiError(error);
  }
}
