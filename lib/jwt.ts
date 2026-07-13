import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { Role } from "@prisma/client";

/**
 * JWT helpers built on `jose` so they run in both the Node.js runtime
 * (route handlers) and the Edge runtime (middleware).
 */

const ACCESS_SECRET = new TextEncoder().encode(
  process.env.JWT_ACCESS_SECRET ?? "dev-access-secret-change-me-please-32chars",
);
const REFRESH_SECRET = new TextEncoder().encode(
  process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret-change-me-please-32chars",
);

export const ACCESS_TTL = process.env.JWT_ACCESS_TTL ?? "15m";
export const REFRESH_TTL = process.env.JWT_REFRESH_TTL ?? "7d";

export const ACCESS_COOKIE = "sth_access";
export const REFRESH_COOKIE = "sth_refresh";

export type AccessTokenPayload = {
  sub: string; // user id
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
};

export type RefreshTokenPayload = {
  sub: string;
  jti: string; // token id, matched against RefreshToken table
};

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return new SignJWT(payload as unknown as JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(ACCESS_SECRET);
}

export async function signRefreshToken(payload: RefreshTokenPayload): Promise<string> {
  return new SignJWT(payload as unknown as JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TTL)
    .sign(REFRESH_SECRET);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, ACCESS_SECRET);
  return payload as unknown as AccessTokenPayload;
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  const { payload } = await jwtVerify(token, REFRESH_SECRET);
  return payload as unknown as RefreshTokenPayload;
}

/** Convert a TTL string like "15m" / "7d" into seconds for cookie maxAge. */
export function ttlToSeconds(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl.trim());
  if (!match) return 900;
  const value = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * (multipliers[unit] ?? 60);
}
