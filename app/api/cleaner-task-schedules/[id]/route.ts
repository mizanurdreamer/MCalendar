import { NextRequest } from "next/server";
import { cleanerTaskScheduleService } from "@/services/CleanerTaskScheduleService";
import { ok, handleApiError } from "@/lib/response";
import { requireActor } from "@/lib/auth";
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
    const actor = await requireActor("SUPER_ADMIN", "CLIENT", "CLEANER");
    const { id } = await params;
    const body = await req.json();
    const dto = updateTaskScheduleSchema.parse(body);

    const result = await cleanerTaskScheduleService.update(
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
    const actor = await requireActor("SUPER_ADMIN", "CLIENT");
    const { id } = await params;
    await cleanerTaskScheduleService.remove(id, actor);
    return ok({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
