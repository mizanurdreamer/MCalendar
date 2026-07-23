import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, verifyAccessToken } from "@/lib/jwt";
import type { Role } from "@/models/role";

/**
 * Edge middleware — protects dashboard pages and routes users to the section
 * that matches their role. API routes enforce their own auth (returning JSON
 * 401/403), so they are intentionally excluded here.
 */

const ROLE_HOME: Record<Role, string> = {
  SUPER_ADMIN: "/admin/dashboard",
  CLIENT: "/client/today",
  ROOMATTENDATNT: "/roomAttendant/today",
};

const ROLE_PREFIX: Record<Role, string> = {
  SUPER_ADMIN: "/admin",
  CLIENT: "/client",
  ROOMATTENDATNT: "/roomAttendant",
};

const AUTH_PAGES = ["/login", "/register"];

const PUBLIC_PREFIXES = ["/_next", "/api", "/icon.svg", "/favicon.ico"];

function isPublic(pathname: string): boolean {
  if (AUTH_PAGES.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p),
  );
}

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

function toLogin(req: NextRequest, pathname: string) {
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(loginUrl);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const role = await readRole(req);

  // Login/register must stay reachable for everyone (sign-in would loop otherwise).
  if (AUTH_PAGES.includes(pathname)) {
    if (role) {
      return NextResponse.redirect(new URL(ROLE_HOME[role], req.url));
    }
    return NextResponse.next();
  }

  // Public assets / API are not gated here (APIs return JSON 401/403).
  if (isPublic(pathname)) return NextResponse.next();

  // Unauthenticated → login (preserving the intended destination).
  if (!role) {
    return toLogin(req, pathname);
  }

  // Authenticated users: bare role root → its home screen.
  const matchedPrefix = (Object.keys(ROLE_PREFIX) as Role[]).find(
    (r) => pathname === ROLE_PREFIX[r] || pathname.startsWith(ROLE_PREFIX[r] + "/"),
  );

  if (matchedPrefix) {
    // Bare role root (e.g. /client) → its dashboard/today.
    if (pathname === ROLE_PREFIX[role]) {
      return NextResponse.redirect(new URL(ROLE_HOME[role], req.url));
    }

    // Keep each role within its own section.
    if (pathname !== ROLE_HOME[role] && !pathname.startsWith(ROLE_PREFIX[role] + "/")) {
      return NextResponse.redirect(new URL(ROLE_HOME[role], req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg).*)",
    "/login",
    "/register",
  ],
};
