import { NextRequest } from "next/server";
import { requireActor } from "@/lib/auth";
import { ok, handleApiError } from "@/lib/response";
import { updateCleanerProfileSchema } from "@/dto/profile.dto";
import { profileService } from "@/services/ProfileService";

export async function GET() {
  try {
    const actor = await requireActor("CLEANER");
    const profile = await profileService.getCleaner(actor);
    return ok(profile);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const actor = await requireActor("CLEANER");
    const dto = updateCleanerProfileSchema.parse(await req.json());
    const profile = await profileService.updateCleaner(actor, dto);
    return ok(profile);
  } catch (error) {
    return handleApiError(error);
  }
}
