import { NextRequest } from "next/server";
import { userService } from "@/services/UserService";
import { createUserSchema } from "@/dto/user.dto";
import { parseListParams } from "@/dto/common.dto";
import { created, ok, handleApiError } from "@/lib/response";
import { requireActor } from "@/lib/auth";
import type { Role } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requireActor("SUPER_ADMIN");
    const params = parseListParams(req.nextUrl.searchParams);
    const roleParam = req.nextUrl.searchParams.get("role") as Role | null;
    const result = await userService.list({ ...params, role: roleParam ?? undefined });
    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireActor("SUPER_ADMIN");
    const dto = createUserSchema.parse(await req.json());
    const user = await userService.create(dto, actor);
    return created(user);
  } catch (error) {
    return handleApiError(error);
  }
}
