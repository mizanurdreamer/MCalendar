import { NextRequest } from "next/server";
import { userService } from "@/services/UserService";
import { createUserSchema } from "@/dto/user.dto";
import { parseListParams } from "@/dto/common.dto";
import { created, ok, handleApiError } from "@/lib/response";
import { requireActor } from "@/lib/auth";
import { ForbiddenError } from "@/lib/errors";
import type { Role } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const actor = await requireActor("SUPER_ADMIN", "CLIENT");
    const roleParam = req.nextUrl.searchParams.get("role") as Role | null;

    // Clients may only browse cleaners; super admins may browse anyone.
    if (actor.role !== "SUPER_ADMIN" && roleParam !== "CLEANER") {
      throw new ForbiddenError();
    }

    const params = parseListParams(req.nextUrl.searchParams);
    const result = await userService.list({
      ...params,
      role: roleParam ?? undefined,
      status: params.status,
    });
    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireActor("SUPER_ADMIN", "CLIENT");
    const dto = createUserSchema.parse(await req.json());

    // Clients may only create cleaner accounts.
    if (actor.role !== "SUPER_ADMIN" && dto.role !== "CLEANER") {
      throw new ForbiddenError();
    }

    const user = await userService.create(dto, actor);
    return created(user);
  } catch (error) {
    return handleApiError(error);
  }
}
