import { test, expect } from "@playwright/test";

test.describe("Login", () => {
  test("should login as SUPER_ADMIN and reach dashboard", async ({ page }) => {
    await page.goto("http://localhost:3000/login");

    await page.fill('input[id="email"]', "admin@bookingcalendar.com");
    await page.fill('input[id="password"]', "Password123!");
    await page.click('button[type="submit"]');

    await page.waitForURL("**/admin/dashboard", { timeout: 10000 });

    expect(page.url()).toContain("/admin/dashboard");
    await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible({ timeout: 10000 });
  });
});
