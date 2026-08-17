import { NextRequest } from "next/server";
import { requireActor } from "@/util/auth";
import { UserRole } from "@/util/enums/UserRole";
import { ok, handleApiError } from "@/util/response";
import { updateClientProfileSchema } from "@/dto/profile.dto";
import { profileService } from "@/services/ProfileService";

export async function GET() {
  try {
    const actor = await requireActor(UserRole.CLIENT, UserRole.ROOM_ATTENDANT);
    const profile = await profileService.getClient(actor);
    return ok(profile);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const actor = await requireActor(UserRole.CLIENT);
    const dto = updateClientProfileSchema.parse(await req.json());
    const profile = await profileService.updateClient(actor, dto);
    return ok(profile);
  } catch (error) {
    return handleApiError(error);
  }
}
