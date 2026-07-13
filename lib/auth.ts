import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  ttlToSeconds,
  ACCESS_TTL,
  REFRESH_TTL,
  verifyAccessToken,
  type AccessTokenPayload,
} from "@/lib/jwt";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import type { ActorContext } from "@/models";

const isProd = process.env.NODE_ENV === "production";

const baseCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax" as const,
  path: "/",
};

/** Attach access + refresh tokens as HTTP-only cookies on a response. */
export function setAuthCookies(
  response: NextResponse,
  tokens: { accessToken: string; refreshToken: string },
) {
  response.cookies.set(ACCESS_COOKIE, tokens.accessToken, {
    ...baseCookieOptions,
    maxAge: ttlToSeconds(ACCESS_TTL),
  });
  response.cookies.set(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseCookieOptions,
    maxAge: ttlToSeconds(REFRESH_TTL),
  });
  return response;
}

/** Remove auth cookies (logout). */
export function clearAuthCookies(response: NextResponse) {
  response.cookies.set(ACCESS_COOKIE, "", { ...baseCookieOptions, maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE, "", { ...baseCookieOptions, maxAge: 0 });
  return response;
}

/**
 * Read + verify the current user from the access-token cookie.
 * Returns null when unauthenticated or the token is invalid/expired.
 * Usable from server components and route handlers.
 */
export async function getCurrentUser(): Promise<AccessTokenPayload | null> {
  const store = await cookies();
  const token = store.get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  try {
    return await verifyAccessToken(token);
  } catch {
    return null;
  }
}

/** Throw if not authenticated, otherwise return the session user. */
export async function requireAuth(): Promise<AccessTokenPayload> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/** Throw unless the authenticated user has one of the allowed roles. */
export async function requireRole(...roles: Role[]): Promise<AccessTokenPayload> {
  const user = await requireAuth();
  if (!roles.includes(user.role)) {
    throw new ForbiddenError();
  }
  return user;
}

/** Authenticated actor context for the service layer. */
export async function requireActor(...roles: Role[]): Promise<ActorContext> {
  const user = roles.length ? await requireRole(...roles) : await requireAuth();
  return { userId: user.sub, role: user.role };
}

/** Landing route for a role after login. */
export function dashboardPathForRole(role: Role): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "/admin/dashboard";
    case "CLEANER":
      return "/cleaner/today";
    case "CLIENT":
    default:
      return "/client/today";
  }
}
