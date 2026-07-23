import { NextRequest } from "next/server";
import { roomAttendantAvailabilityService } from "@/services/RoomAttendantAvailabilityService";
import { ok, handleApiError } from "@/util/response";
import { requireActor } from "@/util/auth";
import { UserRole } from "@/util/enums/UserRole";
import { z } from "zod";

const updateAvailabilitySchema = z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD").optional(),
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
    .optional()
    .nullable(),
  note: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor(UserRole.SUPER_ADMIN, UserRole.CLIENT, UserRole.ROOM_ATTENDANT);
    const { id } = await params;
    const body = await req.json();
    const dto = updateAvailabilitySchema.parse(body);

    const result = await roomAttendantAvailabilityService.update(
      id,
      {
        fromDate: dto.fromDate ? new Date(`${dto.fromDate}T00:00:00.000Z`) : undefined,
        toDate: dto.toDate === undefined ? undefined : dto.toDate ? new Date(`${dto.toDate}T00:00:00.000Z`) : null,
        note: dto.note,
        isActive: dto.isActive,
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
    const actor = await requireActor(UserRole.SUPER_ADMIN, UserRole.CLIENT, UserRole.ROOM_ATTENDANT);
    const { id } = await params;
    await roomAttendantAvailabilityService.remove(id, actor);
    return ok({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
