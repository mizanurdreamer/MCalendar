import { test, expect } from "@playwright/test";

// Test user credentials
const ADMIN_EMAIL = "admin@bookingcalendar.com";
const ADMIN_PASSWORD = "Password123!";
const INVALID_PASSWORD = "WrongPassword123!";
const NON_EXISTENT_EMAIL = "nonexistent@bookingcalendar.com";
const INACTIVE_ADMIN_EMAIL = "inactive-admin@bookingcalendar.com";

test.describe("Admin Login", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login page before each test
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
  });

  test("1. Admin login with valid credentials (positive)", async ({ page }) => {
    // Fill in the login form with valid admin credentials
    await page.fill('input[id="email"]', ADMIN_EMAIL);
    await page.fill('input[id="password"]', ADMIN_PASSWORD);

    // Submit the login form
    await page.click('button[type="submit"]');

    // Wait for navigation to admin dashboard
    await page.waitForURL("**/admin/dashboard", { timeout: 10000 });

    // Verify user is redirected to admin dashboard
    expect(page.url()).toContain("/admin/dashboard");

    // Verify the dashboard welcome message is visible
    await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible({
      timeout: 10000,
    });

    // Verify user is authenticated by checking for admin-specific content
    // The dashboard should display the user's name in the welcome message
    const welcomeText = await page.getByRole("heading", { name: /Welcome/ }).textContent();
    expect(welcomeText).toBeTruthy();
    expect(welcomeText).toContain("Welcome");
  });

  test("2. Admin login with invalid password (negative)", async ({ page }) => {
    // Fill in the login form with valid email but wrong password
    await page.fill('input[id="email"]', ADMIN_EMAIL);
    await page.fill('input[id="password"]', INVALID_PASSWORD);

    // Submit the login form
    await page.click('button[type="submit"]');

    // Wait for error message to appear
    await page.waitForTimeout(2000);

    // Verify user remains on login page
    expect(page.url()).toContain("/login");

    // Verify error message is displayed
    const errorMessage = page.locator("text=Invalid password");
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  test("3. Admin login with non-existent email (negative)", async ({ page }) => {
    // Fill in the login form with non-existent email
    await page.fill('input[id="email"]', NON_EXISTENT_EMAIL);
    await page.fill('input[id="password"]', ADMIN_PASSWORD);

    // Submit the login form
    await page.click('button[type="submit"]');

    // Wait for error message to appear
    await page.waitForTimeout(2000);

    // Verify user remains on login page
    expect(page.url()).toContain("/login");

    // Verify error message is displayed
    const errorMessage = page.locator("text=Invalid email");
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  test("4. Admin session persistence (positive)", async ({ page }) => {
    // Login with valid admin credentials
    await page.fill('input[id="email"]', ADMIN_EMAIL);
    await page.fill('input[id="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for navigation to admin dashboard
    await page.waitForURL("**/admin/dashboard", { timeout: 10000 });

    // Verify we're on the dashboard
    expect(page.url()).toContain("/admin/dashboard");

    // Navigate to another admin page (e.g., users management)
    await page.goto("/admin/users");
    await page.waitForLoadState("networkidle");

    // Verify we can access the admin users page (session persists)
    // If not authenticated, we would be redirected to login
    expect(page.url()).toContain("/admin/users");

    // Navigate back to dashboard
    await page.goto("/admin/dashboard");
    await page.waitForLoadState("networkidle");

    // Verify we can still access the dashboard (session still valid)
    expect(page.url()).toContain("/admin/dashboard");

    // Verify the welcome message is still visible
    await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible({
      timeout: 10000,
    });
  });

  test("5. Inactive admin account cannot login (negative)", async ({ page }) => {
    // Try to login with an inactive admin account
    await page.fill('input[id="email"]', INACTIVE_ADMIN_EMAIL);
    await page.fill('input[id="password"]', ADMIN_PASSWORD);

    // Submit the login form
    await page.click('button[type="submit"]');

    // Wait for error message to appear
    await page.waitForTimeout(2000);

    // Verify user remains on login page
    expect(page.url()).toContain("/login");

    // Verify the specific error message for disabled account
    const errorMessage = page.locator("text=This account is disabled");
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });
});
