import { requireActor } from "@/util/auth";
import { UserRole } from "@/util/enums/UserRole";
import { NextRequest, NextResponse } from "next/server";
import { authService } from "@/services/AuthService";

export async function POST(req: NextRequest) {
  try {
    const actor = await requireActor(UserRole.CLIENT, UserRole.ROOM_ATTENDANT, UserRole.SUPER_ADMIN);
    console.log(actor.userId + " ");
    // Parse body and extract authorization headers
    const { currentPassword, newPassword } = await req.json();
   console.log(currentPassword + " " + newPassword);

    const authHeader = req.headers.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { message: "Unauthorized request." },
        { status: 401 }
      );
    }

    // Input Validation
    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { message: "Both current and new passwords are required." },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { message: "New password must be at least 8 characters long." },
        { status: 400 }
      );
    }

    return await authService.changePassword(actor,currentPassword,newPassword);

  
  } catch (error) {
    console.error("Change Password Error:", error);
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}