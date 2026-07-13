import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, verifyAccessToken } from "@/lib/jwt";
import type { Role } from "@prisma/client";

/**
 * Edge middleware — protects dashboard pages and routes users to the section
 * that matches their role. API routes enforce their own auth (returning JSON
 * 401/403), so they are intentionally excluded here.
 */

const ROLE_HOME: Record<Role, string> = {
  SUPER_ADMIN: "/dashboard/super-admin",
  CLIENT: "/dashboard/client",
  CLEANER: "/dashboard/cleaner",
};

const ROLE_PREFIX: Record<Role, string> = {
  SUPER_ADMIN: "/dashboard/super-admin",
  CLIENT: "/dashboard/client",
  CLEANER: "/dashboard/cleaner",
};

const AUTH_PAGES = ["/login", "/register"];

async function readRole(req: NextRequest): Promise<Role | null> {
  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  try {
    const payload = await verifyAccessToken(token);
    return payload.role;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const role = await readRole(req);

  // Signed-in users shouldn't sit on the login/register pages.
  if (AUTH_PAGES.includes(pathname)) {
    if (role) {
      return NextResponse.redirect(new URL(ROLE_HOME[role], req.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/dashboard")) {
    if (!role) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Keep each role within its own section.
    const allowedPrefix = ROLE_PREFIX[role];
    const isBareDashboard = pathname === "/dashboard" || pathname === "/dashboard/";
    if (isBareDashboard || !pathname.startsWith(allowedPrefix)) {
      return NextResponse.redirect(new URL(ROLE_HOME[role], req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register"],
};
