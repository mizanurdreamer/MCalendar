import { SignJWT } from "jose";
import { loadEnv } from "./env";

loadEnv();

// Mirrors util/jwt.ts so tokens minted here are accepted by the real
// (unmocked) middleware.ts and server-layout auth checks.
const ACCESS_SECRET = new TextEncoder().encode(
  process.env.JWT_ACCESS_SECRET ?? "dev-access-secret-change-me-please-32chars",
);
export const ACCESS_TTL = process.env.JWT_ACCESS_TTL ?? "15m";
export const ACCESS_COOKIE = "sth_access";
export const REFRESH_COOKIE = "sth_refresh";

export type Role = "SUPER_ADMIN" | "CLIENT" | "ROOM_ATTENDANT";

export type TestUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
};

export async function signAccessToken(user: TestUser): Promise<string> {
  return new SignJWT({
    sub: user.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(ACCESS_SECRET);
}
