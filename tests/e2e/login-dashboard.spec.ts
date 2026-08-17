import { test, expect, type Page } from "@playwright/test";
import { signAccessToken, type TestUser } from "./utils/token";

/**
 * Covers GitHub issue #2 "Login check":
 *   - Check login success
 *   - Check dashboard page load
 *
 * The backend (Prisma/Postgres) is not reachable in this sandbox, so the
 * `/api/auth/*` and `/api/stats` calls are intercepted at the network layer
 * with `page.route`. Everything else -- the login form, client-side
 * validation, the real (unmocked) `middleware.ts` auth/role redirect logic,
 * the server-rendered dashboard layout, and the dashboard's data hooks -- is
 * exercised for real in a live `next dev` server + Chromium.
 */

const SUPER_ADMIN: TestUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "admin@bookingcalendar.com",
  firstName: "Ada",
  lastName: "Admin",
  role: "SUPER_ADMIN",
};

const CLIENT_USER: TestUser = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "client@bookingcalendar.com",
  firstName: "Cara",
  lastName: "Client",
  role: "CLIENT",
};

const STATS = [
  { label: "Total Users", value: 42 },
  { label: "Active Users", value: 37 },
  { label: "Clients", value: 12 },
  { label: "Room Attendants", value: 25 },
];

/** Mock the auth + dashboard-data endpoints the app calls after login. */
async function mockBackend(page: Page, user: TestUser) {
  const accessToken = await signAccessToken(user);

  await page.route("**/api/auth/login", async (route) => {
    const request = route.request();
    const body = request.postDataJSON() as { email: string; password: string };

    if (body.email !== user.email || !body.password) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: { code: "UNAUTHORIZED", message: "Invalid email or password" },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "set-cookie": `sth_access=${accessToken}; Path=/; HttpOnly; SameSite=Lax`,
      },
      body: JSON.stringify({ success: true, data: { user } }),
    });
  });

  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { user } }),
    });
  });

  await page.route("**/api/stats", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: STATS }),
    });
  });

  await page.route("**/api/client/calendar-data*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { properties: [], events: [], upcomingCleanings: [] },
      }),
    });
  });
}

test.describe("Issue #2 — Login check", () => {
  test("login succeeds and redirects to the super-admin dashboard, which loads", async ({
    page,
  }) => {
    await mockBackend(page, SUPER_ADMIN);

    await page.goto("/login");
    // CardTitle renders a styled <div>, not a semantic heading, so match by text.
    await expect(page.getByText("Welcome back")).toBeVisible();

    await page.getByLabel("Email").fill(SUPER_ADMIN.email);
    await page.getByLabel("Password").fill("Password123!");
    await page.getByRole("button", { name: "Sign in" }).click();

    // --- Check login success -------------------------------------------
    await expect(page).toHaveURL(/\/admin\/dashboard$/);

    // --- Check dashboard page load ---------------------------------------
    const main = page.getByRole("main");
    await expect(
      main.getByRole("heading", { name: `Welcome, ${SUPER_ADMIN.firstName}` }),
    ).toBeVisible();
    for (const stat of STATS) {
      await expect(main.getByText(stat.label)).toBeVisible();
      await expect(main.getByText(String(stat.value))).toBeVisible();
    }

    // A protected page reachable only once authenticated should stay put
    // on reload, proving the session cookie set at login actually stuck.
    await page.reload();
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
    await expect(
      main.getByRole("heading", { name: `Welcome, ${SUPER_ADMIN.firstName}` }),
    ).toBeVisible();
  });

  test("login succeeds and redirects a client user to their calendar dashboard", async ({
    page,
  }) => {
    await mockBackend(page, CLIENT_USER);

    await page.goto("/login");
    await page.getByLabel("Email").fill(CLIENT_USER.email);
    await page.getByLabel("Password").fill("Password123!");
    await page.getByRole("button", { name: "Sign in" }).click();

    // --- Check login success -------------------------------------------
    await expect(page).toHaveURL(/\/client\/calendar$/);

    // --- Check dashboard page load ---------------------------------------
    // The calendar dashboard shell renders the authenticated user's name in
    // the nav, and the calendar grid itself mounts once its data loads.
    await expect(page.locator("body")).not.toContainText("Application error");
    await expect(page.getByText(CLIENT_USER.email)).toBeVisible();
    await expect(page.locator(".fc")).toBeVisible();
  });

  test("invalid credentials fail login and stay on the login page", async ({ page }) => {
    await mockBackend(page, SUPER_ADMIN);

    await page.goto("/login");
    await page.getByLabel("Email").fill(SUPER_ADMIN.email);
    await page.getByLabel("Password").fill("wrong-password-but-non-empty");
    // Force the mocked route to treat this as a bad login by using an
    // unregistered email instead, since the mock only validates presence
    // of a password. Use a clearly-wrong email to trigger the 401 branch.
    await page.getByLabel("Email").fill("nobody@bookingcalendar.com");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});
