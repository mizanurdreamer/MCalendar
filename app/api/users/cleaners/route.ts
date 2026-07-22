import { NextRequest } from "next/server";
import { userService } from "@/services/UserService";
import { ok, handleApiError } from "@/lib/response";
import { requireActor } from "@/lib/auth";

// Cleaner list for assignment dropdowns (admins + clients).
export async function GET(req: NextRequest) {
  try {
    await requireActor("SUPER_ADMIN", "CLIENT");
    const clientId = req.nextUrl.searchParams.get("clientId") || undefined;
    const cleaners = await userService.listCleaners(clientId);
    return ok(cleaners);
  } catch (error) {
    return handleApiError(error);
  }
}
