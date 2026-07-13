import { NextRequest } from "next/server";
import { userService } from "@/services/UserService";
import { updateUserSchema } from "@/dto/user.dto";
import { uuidSchema } from "@/dto/common.dto";
import { ok, handleApiError } from "@/lib/response";
import { requireActor } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    await requireActor("SUPER_ADMIN");
    const { id } = await params;
    const user = await userService.getById(uuidSchema.parse(id));
    return ok(user);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const actor = await requireActor("SUPER_ADMIN");
    const { id } = await params;
    const dto = updateUserSchema.parse(await req.json());
    const user = await userService.update(uuidSchema.parse(id), dto, actor);
    return ok(user);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const actor = await requireActor("SUPER_ADMIN");
    const { id } = await params;
    await userService.remove(uuidSchema.parse(id), actor);
    return ok({ message: "User deleted" });
  } catch (error) {
    return handleApiError(error);
  }
}
