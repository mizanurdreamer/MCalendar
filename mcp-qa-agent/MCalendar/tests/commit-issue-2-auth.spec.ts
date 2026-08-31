import { test, expect, Page } from '@playwright/test';

// ─── Page Object Models ───────────────────────────────────────────────────────

class LoginPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get usernameInput() {
    return this.page.getByRole('textbox', { name: /username|email/i });
  }

  get passwordInput() {
    return this.page.getByLabel(/password/i);
  }

  get loginButton() {
    return this.page.getByRole('button', { name: /login|sign in/i });
  }

  get errorMessage() {
    return this.page.getByRole('alert');
  }

  async navigate() {
    await this.page.goto('/login');
  }

  async login(username: string, password: string) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }
}

class DashboardPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get navigationMenu() {
    return this.page.getByRole('navigation');
  }

  get mainContent() {
    return this.page.getByRole('main');
  }

  get userProfileSection() {
    return this.page.getByTestId('user-profile');
  }

  get loadingSpinner() {
    return this.page.getByRole('progressbar');
  }

  get errorBanner() {
    return this.page.getByRole('alert').filter({ hasText: /error|failed/i });
  }

  get dashboardWidgets() {
    return this.page.getByTestId('dashboard-widget');
  }

  async waitForFullLoad() {
    await this.page.waitForURL(/\/dashboard/, { timeout: 10_000 });
    await expect(this.loadingSpinner).not.toBeVisible({ timeout: 10_000 });
  }
}

// ─── Test Data ────────────────────────────────────────────────────────────────

const TEST_USERS = {
  valid: {
    username: process.env.TEST_USER_EMAIL ?? 'user@example.com',
    password: process.env.TEST_USER_PASSWORD ?? 'ValidPass123!',
  },
  invalid: {
    username: 'wrong@example.com',
    password: 'WrongPass!',
  },
};

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Authentication & Dashboard', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    await loginPage.navigate();
  });

  // TC-001: Primary Happy Path — login success + dashboard critical components load
  test('should authenticate with valid credentials and render dashboard successfully', async ({ page }) => {
    const apiResponsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/auth/login') && resp.status() === 200,
      { timeout: 10_000 }
    );

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    const failedRequests: string[] = [];
    page.on('response', (resp) => {
      if (resp.url().includes('/api/') && resp.status() >= 400) {
        failedRequests.push(`${resp.status()} ${resp.url()}`);
      }
    });

    await loginPage.login(TEST_USERS.valid.username, TEST_USERS.valid.password);

    const apiResponse = await apiResponsePromise;
    expect(apiResponse.status()).toBe(200);

    await dashboardPage.waitForFullLoad();

    // URL must reflect dashboard route
    await expect(page).toHaveURL(/\/dashboard/);

    // Session cookie or token must exist
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find(
      (c) => c.name === 'session' || c.name === 'auth_token' || c.name === 'access_token'
    );
    expect(sessionCookie, 'Expected a session cookie to be set after login').toBeDefined();
    expect(sessionCookie?.value).toBeTruthy();

    // Critical dashboard UI elements must be present and stable
    await expect(dashboardPage.navigationMenu).toBeVisible();
    await expect(dashboardPage.mainContent).toBeVisible();
    await expect(dashboardPage.userProfileSection).toBeVisible();

    // Widgets must render (at least one)
    const widgetCount = await dashboardPage.dashboardWidgets.count();
    expect(widgetCount, 'Expected at least one dashboard widget to render').toBeGreaterThan(0);

    // No loading states should linger
    await expect(dashboardPage.loadingSpinner).not.toBeVisible();
    await expect(dashboardPage.errorBanner).not.toBeVisible();

    // No API failures on load
    expect(failedRequests, `API failures detected: ${failedRequests.join(', ')}`).toHaveLength(0);

    // No console errors
    expect(consoleErrors, `Console errors detected: ${consoleErrors.join(', ')}`).toHaveLength(0);
  });

  // TC-002: Security — unauthenticated user must not access dashboard
  test('should redirect unauthenticated user away from dashboard to login', async ({ page }) => {
    // Ensure no active session exists
    await page.context().clearCookies();

    await page.goto('/dashboard');

    // Must be bounced back to login
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });

    // Login form must be visible, confirming the page is actionable
    await expect(loginPage.usernameInput).toBeVisible();
    await expect(loginPage.loginButton).toBeVisible();
  });

  // TC-003: Negative path — invalid credentials must show error and block access
  test('should reject invalid credentials and display an error without granting access', async ({ page }) => {
    const apiResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/auth/login'),
      { timeout: 10_000 }
    );

    await loginPage.login(TEST_USERS.invalid.username, TEST_USERS.invalid.password);

    const apiResponse = await apiResponsePromise;
    expect([400, 401, 403]).toContain(apiResponse.status());

    // Error alert must surface to the user
    await expect(loginPage.errorMessage).toBeVisible({ timeout: 5_000 });
    await expect(loginPage.errorMessage).toContainText(/invalid|incorrect|wrong|unauthorized/i);

    // User must remain on login page
    await expect(page).toHaveURL(/\/login/);

    // No session must be established
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find(
      (c) => c.name === 'session' || c.name === 'auth_token' || c.name === 'access_token'
    );
    expect(sessionCookie, 'No session cookie should be set after failed login').toBeUndefined();
  });

  // TC-004: Validation — empty form submission must not proceed
  test('should show field-level validation errors when submitting empty credentials', async ({ page }) => {
    // Submit without filling any fields
    await loginPage.loginButton.click();

    // Must stay on login page — no redirect
    await expect(page).toHaveURL(/\/login/);

    // At least one validation message must appear (username or general alert)
    const usernameValidation = page.getByText(/username.*required|email.*required|this field is required/i);
    const passwordValidation = page.getByText(/password.*required|this field is required/i);
    const genericAlert = loginPage.errorMessage;

    const hasUsernameError = await usernameValidation.isVisible().catch(() => false);
    const hasPasswordError = await passwordValidation.isVisible().catch(() => false);
    const hasGenericAlert = await genericAlert.isVisible().catch(() => false);

    expect(
      hasUsernameError || hasPasswordError || hasGenericAlert,
      'Expected at least one validation error to be visible on empty form submission'
    ).toBe(true);

    // Confirm dashboard was never reached
    expect(page.url()).not.toMatch(/\/dashboard/);
  });
});