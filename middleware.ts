import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, verifyAccessToken } from "@/util/jwt";
import type { Role } from "@/models/role";
import { ROOM_ATTENDANT_SELECT_REQUIRED_COOKIE } from "@/util/auth";

const ROLE_HOME: Record<Role, string> = {
  SUPER_ADMIN: "/admin/dashboard",
  CLIENT: "/client/today",
  ROOM_ATTENDANT: "/room-attendant/today",
};

const ROLE_PREFIX: Record<Role, string> = {
  SUPER_ADMIN: "/admin",
  CLIENT: "/client",
  ROOM_ATTENDANT: "/room-attendant",
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

  if (AUTH_PAGES.includes(pathname)) {
    if (role) {
      return NextResponse.redirect(new URL(ROLE_HOME[role], req.url));
    }
    return NextResponse.next();
  }

  if (isPublic(pathname)) return NextResponse.next();

  if (!role) {
    return toLogin(req, pathname);
  }

  const matchedPrefix = (Object.keys(ROLE_PREFIX) as Role[]).find(
    (r) => pathname === ROLE_PREFIX[r] || pathname.startsWith(ROLE_PREFIX[r] + "/"),
  );

  if (pathname === "/select-client") {
    if (role !== "ROOM_ATTENDANT") {
      return NextResponse.redirect(new URL(ROLE_HOME[role], req.url));
    }
    const selectionRequired = req.cookies.get(ROOM_ATTENDANT_SELECT_REQUIRED_COOKIE)?.value === "1";
    if (!selectionRequired) {
      return NextResponse.redirect(new URL("/room-attendant/today", req.url));
    }
    return NextResponse.next();
  }

  if (matchedPrefix) {
    const selectionRequired = req.cookies.get(ROOM_ATTENDANT_SELECT_REQUIRED_COOKIE)?.value === "1";

    if (
      role === "ROOM_ATTENDANT" &&
      pathname.startsWith("/room-attendant") &&
      selectionRequired
    ) {
      return NextResponse.redirect(new URL("/select-client", req.url));
    }

    if (pathname === ROLE_PREFIX[role]) {
      return NextResponse.redirect(new URL(ROLE_HOME[role], req.url));
    }

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
