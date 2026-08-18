import { test, expect, type Page } from "@playwright/test";
import { signAccessToken, type TestUser } from "../utils/token";

const SUPER_ADMIN: TestUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "admin@bookingcalendar.com",
  firstName: "Ada",
  lastName: "Admin",
  role: "SUPER_ADMIN",
};

const CLIENT: TestUser = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "client1@test.com",
  firstName: "Client",
  lastName: "One",
  role: "CLIENT",
};

const ROOM_ATTENDANT_SINGLE: TestUser = {
  id: "33333333-3333-4333-8333-333333333333",
  email: "attendant1@test.com",
  firstName: "Attendant",
  lastName: "One",
  role: "ROOM_ATTENDANT",
};

const ROOM_ATTENDANT_MULTIPLE: TestUser = {
  id: "44444444-4444-4444-8444-444444444444",
  email: "attendant3@test.com",
  firstName: "Attendant",
  lastName: "Three",
  role: "ROOM_ATTENDANT",
};

const DISABLED_USER: TestUser = {
  id: "55555555-5555-4555-8555-555555555555",
  email: "disabled@test.com",
  firstName: "Disabled",
  lastName: "User",
  role: "CLIENT",
};

async function mockBackendLogin(page: Page, user: TestUser, shouldSucceed: boolean = true) {
  const accessToken = await signAccessToken(user);

  await page.route("**/api/auth/login", async (route) => {
    const request = route.request();
    const postData = request.postDataJSON();

    if (!shouldSucceed) {
      if (postData.email === "nonexistent@test.com") {
        return route.abort("failed");
      }
      if (postData.email === "disabled@test.com") {
        return route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ message: "This account is disabled" }),
        });
      }
      if (postData.password === "wrongpassword") {
        return route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ message: "Invalid password" }),
        });
      }
      if (postData.email === "invalid-email") {
        return route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ message: "Invalid email" }),
        });
      }
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          isActive: true,
          phone: null,
          smsGatewayId: null,
          smsGatewayName: null,
          companyName: null,
          primaryContact: null,
          portfolioSize: null,
          timezone: null,
          serviceArea: null,
          hourlyRate: null,
          rating: null,
          clientId: null,
          clientName: null,
          clientProfileId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: null,
          updatedBy: null,
          deletedAt: null,
        },
      }),
      headers: {
        "Set-Cookie": [
          `sth_access=${accessToken}; Path=/; HttpOnly; SameSite=Lax`,
          `sth_refresh=mock-refresh-token; Path=/; HttpOnly; SameSite=Lax`,
        ],
      },
    });
  });
}

async function mockBackendMe(page: Page, user: TestUser) {
  await page.route("**/api/auth/me", async (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          isActive: true,
          phone: null,
          smsGatewayId: null,
          smsGatewayName: null,
          companyName: null,
          primaryContact: null,
          portfolioSize: null,
          timezone: null,
          serviceArea: null,
          hourlyRate: null,
          rating: null,
          clientId: null,
          clientName: null,
          clientProfileId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: null,
          updatedBy: null,
          deletedAt: null,
        },
      }),
    });
  });
}

async function mockBackendStats(page: Page) {
  await page.route("**/api/stats", async (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          label: "Total Clients",
          value: "42",
          icon: "Users",
        },
        {
          label: "Total Room Attendants",
          value: "28",
          icon: "Users",
        },
        {
          label: "Bookings This Month",
          value: "156",
          icon: "Calendar",
        },
        {
          label: "Completed Tasks",
          value: "1,234",
          icon: "CheckCircle",
        },
      ]),
    });
  });
}

test.describe("Login Check - Acceptance Criteria #2 & #3", () => {
  test.describe("Positive Test Cases", () => {
    test("should allow login with valid SUPER_ADMIN credentials", async ({ page }) => {
      await mockBackendLogin(page, SUPER_ADMIN, true);
      await mockBackendMe(page, SUPER_ADMIN);
      await mockBackendStats(page);

      // Navigate to login page
      await page.goto("http://localhost:3100/login");

      // Fill in login form
      await page.fill('input[id="email"]', SUPER_ADMIN.email);
      await page.fill('input[id="password"]', "Password123!");

      // Click sign in button
      await page.click('button[type="submit"]');

      // Wait for redirect to admin dashboard
      await page.waitForURL("**/admin/dashboard", { timeout: 5000 });

      // Verify dashboard page loaded
      expect(page.url()).toContain("/admin/dashboard");

      // Verify welcome message is displayed
      const welcomeText = page.locator("text=Welcome, Ada");
      await expect(welcomeText).toBeVisible({ timeout: 5000 });
    });

    test("should allow login with valid CLIENT credentials", async ({ page }) => {
      await mockBackendLogin(page, CLIENT, true);
      await mockBackendMe(page, CLIENT);

      // Navigate to login page
      await page.goto("http://localhost:3100/login");

      // Fill in login form
      await page.fill('input[id="email"]', CLIENT.email);
      await page.fill('input[id="password"]', "Password123!");

      // Click sign in button
      await page.click('button[type="submit"]');

      // Wait for redirect to client calendar
      await page.waitForURL("**/client/calendar", { timeout: 5000 });

      // Verify calendar page loaded
      expect(page.url()).toContain("/client/calendar");
    });

    test("should allow login with valid ROOM_ATTENDANT credentials (single account)", async ({
      page,
    }) => {
      await mockBackendLogin(page, ROOM_ATTENDANT_SINGLE, true);
      await mockBackendMe(page, ROOM_ATTENDANT_SINGLE);

      // Navigate to login page
      await page.goto("http://localhost:3100/login");

      // Fill in login form
      await page.fill('input[id="email"]', ROOM_ATTENDANT_SINGLE.email);
      await page.fill('input[id="password"]', "Password123!");

      // Click sign in button
      await page.click('button[type="submit"]');

      // Wait for redirect to select-client page (room attendant initial page)
      await page.waitForURL("**/select-client", { timeout: 5000 });

      // Verify select-client page loaded
      expect(page.url()).toContain("/select-client");
    });

    test("should set auth cookies after successful login", async ({ page, context }) => {
      await mockBackendLogin(page, SUPER_ADMIN, true);
      await mockBackendMe(page, SUPER_ADMIN);
      await mockBackendStats(page);

      // Navigate to login page
      await page.goto("http://localhost:3100/login");

      // Fill in login form
      await page.fill('input[id="email"]', SUPER_ADMIN.email);
      await page.fill('input[id="password"]', "Password123!");

      // Click sign in button
      await page.click('button[type="submit"]');

      // Wait for redirect
      await page.waitForURL("**/admin/dashboard", { timeout: 5000 });

      // Get cookies
      const cookies = await context.cookies();
      const accessCookie = cookies.find((c) => c.name === "sth_access");
      const refreshCookie = cookies.find((c) => c.name === "sth_refresh");

      // Verify cookies are set
      expect(accessCookie).toBeDefined();
      expect(refreshCookie).toBeDefined();
      expect(accessCookie?.httpOnly).toBe(true);
      expect(refreshCookie?.httpOnly).toBe(true);
    });

    test("should validate email field is required", async ({ page }) => {
      await page.goto("http://localhost:3100/login");

      // Leave email empty
      await page.fill('input[id="email"]', "");
      await page.fill('input[id="password"]', "Password123!");

      // Try to submit
      await page.click('button[type="submit"]');

      // Check for validation error - look for error message text
      const emailError = page.locator("text=/Email is required|Enter a valid email/i");
      await expect(emailError).toBeVisible({ timeout: 2000 });
    });

    test("should validate invalid email format", async ({ page }) => {
      await page.goto("http://localhost:3100/login");

      // Enter invalid email
      await page.fill('input[id="email"]', "notanemail");
      await page.fill('input[id="password"]', "Password123!");

      // Try to submit
      await page.click('button[type="submit"]');

      // Check for validation error
      const emailError = page.locator("text=/Invalid email|Enter a valid email/i");
      await expect(emailError).toBeVisible({ timeout: 2000 });
    });

    test("should validate password field is required", async ({ page }) => {
      await page.goto("http://localhost:3100/login");

      // Enter email but leave password empty
      await page.fill('input[id="email"]', CLIENT.email);
      await page.fill('input[id="password"]', "");

      // Try to submit
      await page.click('button[type="submit"]');

      // Check for validation error
      const passwordError = page.locator("text=/Password is required|String must contain at least/i");
      await expect(passwordError).toBeVisible({ timeout: 2000 });
    });

    test("should display dashboard page with correct content after login", async ({ page }) => {
      await mockBackendLogin(page, SUPER_ADMIN, true);
      await mockBackendMe(page, SUPER_ADMIN);
      await mockBackendStats(page);

      // Navigate to login page
      await page.goto("http://localhost:3100/login");

      // Fill in login form
      await page.fill('input[id="email"]', SUPER_ADMIN.email);
      await page.fill('input[id="password"]', "Password123!");

      // Click sign in button
      await page.click('button[type="submit"]');

      // Wait for dashboard to load
      await page.waitForURL("**/admin/dashboard", { timeout: 5000 });

      // Verify page title/header
      const pageHeader = page.locator("text=Welcome, Ada");
      await expect(pageHeader).toBeVisible({ timeout: 5000 });

      // Verify description is visible
      const description = page.locator("text=Platform-wide operations at a glance");
      await expect(description).toBeVisible({ timeout: 5000 });
    });

    test("should handle email case insensitivity", async ({ page }) => {
      await mockBackendLogin(page, CLIENT, true);
      await mockBackendMe(page, CLIENT);

      // Navigate to login page
      await page.goto("http://localhost:3100/login");

      // Fill in login form with uppercase email
      await page.fill('input[id="email"]', "CLIENT1@TEST.COM");
      await page.fill('input[id="password"]', "Password123!");

      // Click sign in button
      await page.click('button[type="submit"]');

      // Wait for redirect to client calendar
      await page.waitForURL("**/client/calendar", { timeout: 5000 });

      // Verify calendar page loaded
      expect(page.url()).toContain("/client/calendar");
    });
  });

  test.describe("Negative Test Cases", () => {
    test("should reject login with invalid email", async ({ page }) => {
      await mockBackendLogin(page, CLIENT, false);

      // Navigate to login page
      await page.goto("http://localhost:3100/login");

      // Fill in login form with non-existent email
      await page.fill('input[id="email"]', "nonexistent@test.com");
      await page.fill('input[id="password"]', "Password123!");

      // Click sign in button
      await page.click('button[type="submit"]');

      // Wait a moment for error handling
      await page.waitForTimeout(1000);

      // User should still be on login page
      expect(page.url()).toContain("/login");
    });

    test("should reject login with invalid password", async ({ page }) => {
      await mockBackendLogin(page, CLIENT, false);

      // Navigate to login page
      await page.goto("http://localhost:3100/login");

      // Fill in login form with correct email but wrong password
      await page.fill('input[id="email"]', CLIENT.email);
      await page.fill('input[id="password"]', "wrongpassword");

      // Click sign in button
      await page.click('button[type="submit"]');

      // Wait a moment for error handling
      await page.waitForTimeout(1000);

      // User should still be on login page
      expect(page.url()).toContain("/login");

      // Error message should be displayed
      const errorMessage = page.locator("text=Invalid password");
      await expect(errorMessage).toBeVisible({ timeout: 2000 });
    });

    test("should reject login for disabled account", async ({ page }) => {
      await mockBackendLogin(page, DISABLED_USER, false);

      // Navigate to login page
      await page.goto("http://localhost:3100/login");

      // Fill in login form
      await page.fill('input[id="email"]', "disabled@test.com");
      await page.fill('input[id="password"]', "Password123!");

      // Click sign in button
      await page.click('button[type="submit"]');

      // Wait a moment for error handling
      await page.waitForTimeout(1000);

      // User should still be on login page
      expect(page.url()).toContain("/login");

      // Error message should be displayed
      const errorMessage = page.locator("text=This account is disabled");
      await expect(errorMessage).toBeVisible({ timeout: 2000 });
    });

    test("should not set auth cookies on failed login", async ({ page, context }) => {
      await mockBackendLogin(page, CLIENT, false);

      // Navigate to login page
      await page.goto("http://localhost:3100/login");

      // Fill in login form with wrong password
      await page.fill('input[id="email"]', CLIENT.email);
      await page.fill('input[id="password"]', "wrongpassword");

      // Click sign in button
      await page.click('button[type="submit"]');

      // Wait a moment for error handling
      await page.waitForTimeout(1000);

      // Get cookies
      const cookies = await context.cookies();
      const accessCookie = cookies.find((c) => c.name === "sth_access");

      // Verify access cookie is not set
      expect(accessCookie).toBeUndefined();
    });

    test("should display error message on login failure", async ({ page }) => {
      await mockBackendLogin(page, CLIENT, false);

      // Navigate to login page
      await page.goto("http://localhost:3100/login");

      // Fill in login form with wrong password
      await page.fill('input[id="email"]', CLIENT.email);
      await page.fill('input[id="password"]', "wrongpassword");

      // Click sign in button
      await page.click('button[type="submit"]');

      // Wait for error message
      const errorMessage = page.locator("text=Invalid password");
      await expect(errorMessage).toBeVisible({ timeout: 2000 });
    });
  });

  test.describe("Edge Cases", () => {
    test("should handle rapid successive login attempts", async ({ page }) => {
      await mockBackendLogin(page, SUPER_ADMIN, true);
      await mockBackendMe(page, SUPER_ADMIN);
      await mockBackendStats(page);

      // Navigate to login page
      await page.goto("http://localhost:3100/login");

      // Fill in login form
      await page.fill('input[id="email"]', SUPER_ADMIN.email);
      await page.fill('input[id="password"]', "Password123!");

      // Click sign in button multiple times rapidly
      const submitButton = page.locator('button[type="submit"]');
      await submitButton.click();
      await submitButton.click();
      await submitButton.click();

      // Should eventually redirect to dashboard
      await page.waitForURL("**/admin/dashboard", { timeout: 5000 });

      // Verify dashboard loaded
      expect(page.url()).toContain("/admin/dashboard");
    });

    test("should handle whitespace in email field", async ({ page }) => {
      await mockBackendLogin(page, CLIENT, true);
      await mockBackendMe(page, CLIENT);

      // Navigate to login page
      await page.goto("http://localhost:3100/login");

      // Fill in login form with whitespace
      await page.fill('input[id="email"]', `  ${CLIENT.email}  `);
      await page.fill('input[id="password"]', "Password123!");

      // Click sign in button
      await page.click('button[type="submit"]');

      // Should handle whitespace and redirect
      await page.waitForURL("**/client/calendar", { timeout: 5000 });

      // Verify calendar page loaded
      expect(page.url()).toContain("/client/calendar");
    });

    test("should display loading state during login", async ({ page }) => {
      await mockBackendLogin(page, SUPER_ADMIN, true);
      await mockBackendMe(page, SUPER_ADMIN);
      await mockBackendStats(page);

      // Navigate to login page
      await page.goto("http://localhost:3100/login");

      // Fill in login form
      await page.fill('input[id="email"]', SUPER_ADMIN.email);
      await page.fill('input[id="password"]', "Password123!");

      // Click sign in button
      const submitButton = page.locator('button[type="submit"]');
      await submitButton.click();

      // Check if button shows loading state (disabled or spinner)
      // The button should be disabled during submission
      await expect(submitButton).toBeDisabled({ timeout: 2000 });

      // Wait for redirect
      await page.waitForURL("**/admin/dashboard", { timeout: 5000 });
    });

    test("should maintain form state on validation error", async ({ page }) => {
      await page.goto("http://localhost:3100/login");

      // Fill in email
      const emailInput = page.locator('input[id="email"]');
      await emailInput.fill(CLIENT.email);

      // Leave password empty and try to submit
      await page.click('button[type="submit"]');

      // Wait for validation error
      await page.waitForTimeout(500);

      // Verify email is still filled
      const emailValue = await emailInput.inputValue();
      expect(emailValue).toBe(CLIENT.email);

      // Verify password error is shown
      const passwordError = page.locator("text=/Password is required|String must contain at least/i");
      await expect(passwordError).toBeVisible({ timeout: 2000 });
    });

    test("should redirect authenticated user away from login page", async ({ page, context }) => {
      await mockBackendLogin(page, SUPER_ADMIN, true);
      await mockBackendMe(page, SUPER_ADMIN);
      await mockBackendStats(page);

      // First, login
      await page.goto("http://localhost:3100/login");
      await page.fill('input[id="email"]', SUPER_ADMIN.email);
      await page.fill('input[id="password"]', "Password123!");
      await page.click('button[type="submit"]');

      // Wait for redirect to dashboard
      await page.waitForURL("**/admin/dashboard", { timeout: 5000 });

      // Now try to navigate back to login page
      await page.goto("http://localhost:3100/login");

      // Should be redirected back to dashboard
      await page.waitForURL("**/admin/dashboard", { timeout: 5000 });
      expect(page.url()).toContain("/admin/dashboard");
    });

    test("should have accessible form elements", async ({ page }) => {
      await page.goto("http://localhost:3100/login");

      // Check for labels
      const emailLabel = page.locator('label[for="email"]');
      const passwordLabel = page.locator('label[for="password"]');

      await expect(emailLabel).toBeVisible();
      await expect(passwordLabel).toBeVisible();

      // Check for input fields
      const emailInput = page.locator('input[id="email"]');
      const passwordInput = page.locator('input[id="password"]');

      await expect(emailInput).toBeVisible();
      await expect(passwordInput).toBeVisible();

      // Check for submit button
      const submitButton = page.locator('button[type="submit"]');
      await expect(submitButton).toBeVisible();
    });

    test("should display register link on login page", async ({ page }) => {
      await page.goto("http://localhost:3100/login");

      // Check for register link
      const registerLink = page.locator('a[href="/register"]');
      await expect(registerLink).toBeVisible();

      // Verify link text
      const linkText = page.locator("text=Create one");
      await expect(linkText).toBeVisible();
    });
  });

  test.describe("Dashboard Page Load - Acceptance Criteria #3", () => {
    test("should load admin dashboard with stats after SUPER_ADMIN login", async ({ page }) => {
      await mockBackendLogin(page, SUPER_ADMIN, true);
      await mockBackendMe(page, SUPER_ADMIN);
      await mockBackendStats(page);

      // Navigate to login page
      await page.goto("http://localhost:3100/login");

      // Fill in login form
      await page.fill('input[id="email"]', SUPER_ADMIN.email);
      await page.fill('input[id="password"]', "Password123!");

      // Click sign in button
      await page.click('button[type="submit"]');

      // Wait for dashboard to load
      await page.waitForURL("**/admin/dashboard", { timeout: 5000 });

      // Verify page content
      const welcomeText = page.locator("text=Welcome, Ada");
      await expect(welcomeText).toBeVisible({ timeout: 5000 });

      // Verify description
      const description = page.locator("text=Platform-wide operations at a glance");
      await expect(description).toBeVisible({ timeout: 5000 });
    });

    test("should load client calendar after CLIENT login", async ({ page }) => {
      await mockBackendLogin(page, CLIENT, true);
      await mockBackendMe(page, CLIENT);

      // Navigate to login page
      await page.goto("http://localhost:3100/login");

      // Fill in login form
      await page.fill('input[id="email"]', CLIENT.email);
      await page.fill('input[id="password"]', "Password123!");

      // Click sign in button
      await page.click('button[type="submit"]');

      // Wait for calendar page to load
      await page.waitForURL("**/client/calendar", { timeout: 5000 });

      // Verify page loaded
      expect(page.url()).toContain("/client/calendar");
    });

    test("should load room attendant select-client page after ROOM_ATTENDANT login", async ({
      page,
    }) => {
      await mockBackendLogin(page, ROOM_ATTENDANT_SINGLE, true);
      await mockBackendMe(page, ROOM_ATTENDANT_SINGLE);

      // Navigate to login page
      await page.goto("http://localhost:3100/login");

      // Fill in login form
      await page.fill('input[id="email"]', ROOM_ATTENDANT_SINGLE.email);
      await page.fill('input[id="password"]', "Password123!");

      // Click sign in button
      await page.click('button[type="submit"]');

      // Wait for select-client page to load (room attendant initial page)
      await page.waitForURL("**/select-client", { timeout: 5000 });

      // Verify page loaded
      expect(page.url()).toContain("/select-client");
    });

    test("should display correct role-specific dashboard", async ({ page }) => {
      await mockBackendLogin(page, SUPER_ADMIN, true);
      await mockBackendMe(page, SUPER_ADMIN);
      await mockBackendStats(page);

      // Navigate to login page
      await page.goto("http://localhost:3100/login");

      // Fill in login form
      await page.fill('input[id="email"]', SUPER_ADMIN.email);
      await page.fill('input[id="password"]', "Password123!");

      // Click sign in button
      await page.click('button[type="submit"]');

      // Wait for dashboard to load
      await page.waitForURL("**/admin/dashboard", { timeout: 5000 });

      // Verify admin-specific content
      const adminContent = page.locator("text=Welcome, Ada");
      await expect(adminContent).toBeVisible({ timeout: 5000 });

      // Verify URL is admin dashboard
      expect(page.url()).toContain("/admin/dashboard");
    });
  });
});
