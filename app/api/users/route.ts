import { NextRequest } from "next/server";
import { userService } from "@/services/UserService";
import { createUserSchema } from "@/dto/user.dto";
import { parseListParams } from "@/dto/common.dto";
import { created, ok, handleApiError } from "@/lib/response";
import { requireActor } from "@/lib/auth";
import { ForbiddenError } from "@/lib/errors";
import { isRole, type Role } from "@/models/role";

export async function GET(req: NextRequest) {
  try {
    const actor = await requireActor("SUPER_ADMIN", "CLIENT");
    const rawRole = req.nextUrl.searchParams.get("role");
    const roleParam: Role | null = rawRole && isRole(rawRole) ? rawRole : null;

    // Clients may only browse roomAttendants; super admins may browse anyone.
    if (actor.role !== "SUPER_ADMIN" && roleParam !== "ROOMATTENDATNT") {
      throw new ForbiddenError();
    }

    const params = parseListParams(req.nextUrl.searchParams);
    const clientId = req.nextUrl.searchParams.get("clientId") || undefined;
    const result = await userService.list({
      ...params,
      role: roleParam ?? undefined,
      status: params.status,
      clientId,
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

    // Clients may only create roomAttendant accounts.
    if (actor.role !== "SUPER_ADMIN" && dto.role !== "ROOMATTENDATNT") {
      throw new ForbiddenError();
    }

    const user = await userService.create(dto, actor);
    return created(user);
  } catch (error) {
    return handleApiError(error);
  }
}
