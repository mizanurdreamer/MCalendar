import { SignJWT } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "booking-calendar-jwt-secret-key"
);

export interface TestUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "SUPER_ADMIN" | "CLIENT" | "ROOM_ATTENDANT";
}

export async function signAccessToken(user: TestUser): Promise<string> {
  return new SignJWT({
    sub: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(JWT_SECRET);
}
