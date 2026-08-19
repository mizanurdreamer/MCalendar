import { test as setup } from "@playwright/test";
import { SignJWT } from "jose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const ACCESS_SECRET = new TextEncoder().encode(
  process.env.JWT_ACCESS_SECRET ?? "dev-access-secret-change-me-in-production-please-32chars"
);

type Role = "SUPER_ADMIN" | "CLIENT" | "ROOM_ATTENDANT";

interface TestUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
}

const USERS: Record<string, TestUser> = {
  admin: {
    id: "4cb08a9e-22a4-47a6-9949-aea7f1dbbd7b",
    email: "admin@bookingcalendar.com",
    firstName: "Ada",
    lastName: "Admin",
    role: "SUPER_ADMIN",
  },
  client: {
    id: "db6c3dca-385f-409e-bb89-1a27cb1e34af",
    email: "client@bookingcalendar.com",
    firstName: "Client",
    lastName: "One",
    role: "CLIENT",
  },
  attendant: {
    id: "31b8f08a-e728-4c32-b7bf-9e2283f3ce8d",
    email: "roomattendant@bookingcalendar.com",
    firstName: "Attendant",
    lastName: "One",
    role: "ROOM_ATTENDANT",
  },
};

const DASHBOARD_PATH: Record<Role, string> = {
  SUPER_ADMIN: `${baseUrl}/admin/dashboard`,
  CLIENT: `${baseUrl}/client/calendar`,
  ROOM_ATTENDANT: `${baseUrl}/room-attendant/task-schedule`,
};

async function signAccessToken(user: TestUser): Promise<string> {
  return new SignJWT({
    sub: user.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("60m")
    .sign(ACCESS_SECRET);
}

async function authenticateAs(
  page: import("@playwright/test").Page,
  user: TestUser,
  storagePath: string
) {
  const accessToken = await signAccessToken(user);

  await page.context().addCookies([
    {
      name: "sth_access",
      value: accessToken,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      name: "sth_refresh",
      value: "mock-refresh-token",
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  await page.goto(DASHBOARD_PATH[user.role]);
  await page.waitForLoadState("networkidle");

  await page.context().storageState({ path: storagePath });
}

setup("authenticate as SUPER_ADMIN", async ({ page }) => {
  await authenticateAs(page, USERS.admin, "E2ETests/.auth/admin.json");
});

setup("authenticate as CLIENT", async ({ page }) => {
  await authenticateAs(page, USERS.client, "E2ETests/.auth/client.json");
});

setup("authenticate as ROOM_ATTENDANT", async ({ page }) => {
  await authenticateAs(page, USERS.attendant, "E2ETests/.auth/attendant.json");
});
