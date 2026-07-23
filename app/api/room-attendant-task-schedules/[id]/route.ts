import { NextRequest } from "next/server";
import { roomAttendantTaskScheduleService } from "@/services/RoomAttendantTaskScheduleService";
import { ok, handleApiError } from "@/util/response";
import { requireActor } from "@/util/auth";
import { UserRole } from "@/util/enums/UserRole";
import { z } from "zod";

const STATUS_VALUES = [0, 1, 2, 3, 4] as const;

const updateTaskScheduleSchema = z.object({
  isActive: z.boolean().optional(),
  status: z.number().int().refine((v) => (STATUS_VALUES as readonly number[]).includes(v), {
    message: "Status must be 0 (ASSIGNED), 1 (CONFIRMED), 2 (IN_PROGRESS), 3 (DONE), or 4 (CANCELLED)",
  }).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor(UserRole.SUPER_ADMIN, UserRole.CLIENT, UserRole.ROOM_ATTENDANT);
    const { id } = await params;
    const body = await req.json();
    const dto = updateTaskScheduleSchema.parse(body);

    const result = await roomAttendantTaskScheduleService.update(
      id,
      {
        isActive: dto.isActive,
        status: dto.status,
      },
      actor,
    );
    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor(UserRole.SUPER_ADMIN, UserRole.CLIENT);
    const { id } = await params;
    await roomAttendantTaskScheduleService.remove(id, actor);
    return ok({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
