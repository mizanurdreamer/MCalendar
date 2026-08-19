import { test, expect } from "@playwright/test";

function whenProject(name: string) {
  return test.info().project.name === name;
}

test.describe("Authenticated as SUPER_ADMIN", () => {
  test("can access admin dashboard", async ({ page }) => {
    test.skip(!whenProject("admin-chromium"), "requires admin auth state");

    await page.goto("/admin/dashboard");
    await page.waitForLoadState("networkidle");

    expect(page.url()).toContain("/admin/dashboard");
    await expect(page.locator("text=Welcome")).toBeVisible({ timeout: 10000 });
  });

  test("is redirected away from login page", async ({ page }) => {
    test.skip(!whenProject("admin-chromium"), "requires admin auth state");

    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    expect(page.url()).toContain("/admin/dashboard");
  });

  test("can access stats API", async ({ page }) => {
    test.skip(!whenProject("admin-chromium"), "requires admin auth state");

    const response = await page.request.get("/api/stats");
    expect(response.ok()).toBeTruthy();
  });
});

test.describe("Authenticated as CLIENT", () => {
  test("can access client calendar", async ({ page }) => {
    test.skip(!whenProject("client-chromium"), "requires client auth state");

    await page.goto("/client/calendar");
    await page.waitForLoadState("networkidle");

    expect(page.url()).toContain("/client/calendar");
  });

  test("is redirected away from login page", async ({ page }) => {
    test.skip(!whenProject("client-chromium"), "requires client auth state");

    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    expect(page.url()).toContain("/client/calendar");
  });
});

test.describe("Authenticated as ROOM_ATTENDANT", () => {
  test("can access task schedule", async ({ page }) => {
    test.skip(!whenProject("attendant-chromium"), "requires attendant auth state");

    await page.goto("/room-attendant/task-schedule");
    await page.waitForLoadState("networkidle");

    expect(page.url()).toContain("/room-attendant");
  });

  test("is redirected away from login page", async ({ page }) => {
    test.skip(!whenProject("attendant-chromium"), "requires attendant auth state");

    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    expect(page.url()).not.toContain("/login");
  });
});
