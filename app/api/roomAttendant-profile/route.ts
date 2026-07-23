import { NextRequest } from "next/server";
import { requireActor } from "@/lib/auth";
import { ok, handleApiError } from "@/lib/response";
import { updateRoomAttendantProfileSchema } from "@/dto/profile.dto";
import { profileService } from "@/services/ProfileService";

export async function GET() {
  try {
    const actor = await requireActor("ROOMATTENDATNT");
    const profile = await profileService.getRoomAttendant(actor);
    return ok(profile);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const actor = await requireActor("ROOMATTENDATNT");
    const dto = updateRoomAttendantProfileSchema.parse(await req.json());
    const profile = await profileService.updateRoomAttendant(actor, dto);
    return ok(profile);
  } catch (error) {
    return handleApiError(error);
  }
}
