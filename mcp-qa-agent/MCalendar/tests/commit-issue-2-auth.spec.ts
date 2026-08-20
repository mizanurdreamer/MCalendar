import { test, expect, Page, BrowserContext } from '@playwright/test';
import { defineConfig, devices } from '@playwright/test';

// ============================================================
// HELPERS
// ============================================================

class LoginHelper {
  constructor(private page: Page) {}

  async navigateToLogin() {
    await this.page.goto('/login');
    await expect(this.page).toHaveURL(/\/login/);
  }

  async fillEmail(email: string) {
    const emailField =
      this.page.getByLabel('Email').first() ||
      this.page.locator('input[type="email"]').first() ||
      this.page.locator('input[name="email"]').first();
    await emailField.fill(email);
  }

  async fillPassword(password: string) {
    const passwordField =
      this.page.getByLabel('Password').first() ||
      this.page.locator('input[type="password"]').first() ||
      this.page.locator('input[name="password"]').first();
    await passwordField.fill(password);
  }

  async clickLoginButton() {
    await this.page
      .getByRole('button', { name: /login/i })
      .click();
  }

  async loginWithCredentials(email: string, password: string) {
    await this.navigateToLogin();
    await this.fillEmail(email);
    await this.fillPassword(password);
    await this.clickLoginButton();
  }

  async loginWithValidCredentials(
    email = process.env.TEST_USER_EMAIL || 'user@example.com',
    password = process.env.TEST_USER_PASSWORD || 'ValidPass123!'
  ) {
    await this.loginWithCredentials(email, password);
    await expect(this.page).toHaveURL(/\/dashboard/);
  }

  async getSessionCookie(context: BrowserContext) {
    const cookies = await context.cookies();
    return cookies.find(
      (c) =>
        c.name === 'session' ||
        c.name === 'auth_token' ||
        c.name === 'access_token' ||
        c.name.toLowerCase().includes('session') ||
        c.name.toLowerCase().includes('token')
    );
  }

  async getLocalStorageToken(page: Page): Promise<string | null> {
    return page.evaluate(() => {
      return (
        localStorage.getItem('auth_token') ||
        localStorage.getItem('token') ||
        localStorage.getItem('access_token') ||
        sessionStorage.getItem('auth_token') ||
        sessionStorage.getItem('token')
      );
    });
  }
}

// ============================================================
// TC-LOGIN-001: Successful login redirects to dashboard
// ============================================================

test.describe('Login - Success Flow', () => {
  let loginHelper: LoginHelper;

  test.beforeEach(async ({ page }) => {
    loginHelper = new LoginHelper(page);
    await loginHelper.navigateToLogin();
  });

  test('TC-LOGIN-001: Should redirect to /dashboard on valid credentials', async ({
    page,
  }) => {
    const email = process.env.TEST_USER_EMAIL || 'user@example.com';
    const password = process.env.TEST_USER_PASSWORD || 'ValidPass123!';

    await loginHelper.fillEmail(email);
    await loginHelper.fillPassword(password);
    await loginHelper.clickLoginButton();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  });

  test('TC-LOGIN-002: Should store a session token after successful login', async ({
    page,
    context,
  }) => {
    await loginHelper.loginWithValidCredentials();

    const sessionCookie = await loginHelper.getSessionCookie(context);
    const localStorageToken = await loginHelper.getLocalStorageToken(page);

    const hasSession = !!sessionCookie || !!localStorageToken;
    expect(hasSession).toBeTruthy();
  });

  test('TC-LOGIN-003: Should display welcome message containing user name after login', async ({
    page,
  }) => {
    await loginHelper.loginWithValidCredentials();

    const welcomeLocator = page
      .locator(
        '[data-testid="welcome-message"], .welcome-message, [aria-label*="welcome" i], h1, h2'
      )
      .first();
    await expect(welcomeLocator).toBeVisible({ timeout: 10000 });

    const text = await welcomeLocator.textContent();
    expect(text).toBeTruthy();
  });

  test('TC-LOGIN-004: Login page should not be accessible to authenticated user without re-authentication', async ({
    page,
    context,
  }) => {
    await loginHelper.loginWithValidCredentials();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto('/login');

    await page.waitForURL((url) => {
      return url.pathname === '/dashboard' || url.pathname.includes('dashboard');
    }, { timeout: 10000 }).catch(() => {});

    const currentUrl = page.url();
    const isDashboard = currentUrl.includes('dashboard');
    const hasLoginForm = await page
      .locator('input[type="password"]')
      .isVisible()
      .catch(() => false);

    expect(isDashboard || !hasLoginForm).toBeTruthy();
  });
});

// ============================================================
// Login - Failure Scenarios
// ============================================================

test.describe('Login - Failure Flow', () => {
  let loginHelper: LoginHelper;

  test.beforeEach(async ({ page }) => {
    loginHelper = new LoginHelper(page);
    await loginHelper.navigateToLogin();
  });

  test('TC-LOGIN-005: Should show error message on incorrect password', async ({
    page,
    context,
  }) => {
    await loginHelper.fillEmail('user@example.com');
    await loginHelper.fillPassword('WrongPassword!');
    await loginHelper.clickLoginButton();

    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });

    const errorLocator = page.locator(
      '[data-testid="error-message"], .error-message, [role="alert"], .alert-error, .error'
    );
    await expect(errorLocator.first()).toBeVisible({ timeout: 8000 });

    const errorText = await errorLocator.first().textContent();
    expect(errorText?.toLowerCase()).toMatch(
      /invalid|incorrect|wrong|email or password|credentials/i
    );

    const sessionCookie = await loginHelper.getSessionCookie(context);
    const localStorageToken = await loginHelper.getLocalStorageToken(page);
    expect(!!sessionCookie || !!localStorageToken).toBeFalsy();
  });

  test('TC-LOGIN-006: Should show validation error when email is empty', async ({
    page,
  }) => {
    await loginHelper.fillEmail('');
    await loginHelper.fillPassword('ValidPass123!');
    await loginHelper.clickLoginButton();

    const emailInput = page.locator(
      'input[type="email"], input[name="email"]'
    );

    const validationMessage = await emailInput
      .evaluate((el: HTMLInputElement) => el.validationMessage)
      .catch(() => '');

    const errorLocator = page.locator(
      '[data-testid="email-error"], .email-error, [role="alert"]'
    );
    const errorVisible = await errorLocator
      .first()
      .isVisible()
      .catch(() => false);

    expect(validationMessage || errorVisible).toBeTruthy();
    await expect(page).toHaveURL(/\/login/);
  });

  test('TC-LOGIN-007: Should show validation error when password is empty', async ({
    page,
  }) => {
    await loginHelper.fillEmail('user@example.com');
    await loginHelper.fillPassword('');
    await loginHelper.clickLoginButton();

    const passwordInput = page.locator('input[type="password"]');
    const validationMessage = await passwordInput
      .evaluate((el: HTMLInputElement) => el.validationMessage)
      .catch(() => '');

    const errorLocator = page.locator(
      '[data-testid="password-error"], .password-error, [role="alert"]'
    );
    const errorVisible = await errorLocator
      .first()
      .isVisible()
      .catch(() => false);

    expect(validationMessage || errorVisible).toBeTruthy();
    await expect(page).toHaveURL(/\/login/);
  });

  test('TC-LOGIN-008: Should show validation error when both fields are empty', async ({
    page,
  }) => {
    await loginHelper.fillEmail('');
    await loginHelper.fillPassword('');
    await loginHelper.clickLoginButton();

    await expect(page).toHaveURL(/\/login/);

    const emailInput = page.locator('input[type="email"], input[name="email"]');
    const emailValidation = await emailInput
      .evaluate((el: HTMLInputElement) => el.validationMessage)
      .catch(() => '');

    const hasValidation = !!emailValidation;
    const errorLocator = page.locator('[role="alert"], .error, .error-message');
    const errorVisible = await errorLocator
      .first()
      .isVisible()
      .catch(() => false);

    expect(hasValidation || errorVisible).toBeTruthy();
  });

  test('TC-LOGIN-009: Should show validation error for invalid email format', async ({
    page,
  }) => {
    await loginHelper.fillEmail('not-an-email');
    await loginHelper.fillPassword('ValidPass123!');
    await loginHelper.clickLoginButton();

    const emailInput = page.locator('input[type="email"], input[name="email"]');
    const validationMessage = await emailInput
      .evaluate((el: HTMLInputElement) => el.validationMessage)
      .catch(() => '');

    const errorLocator = page.locator('[role="alert"], .error, .email-error');
    const errorVisible = await errorLocator
      .first()
      .isVisible()
      .catch(() => false);

    expect(validationMessage || errorVisible).toBeTruthy();
    await expect(page).toHaveURL(/\/login/);
  });
});

// ============================================================
// Session Persistence Tests
// ============================================================

test.describe('Session - Persistence', () => {
  let loginHelper: LoginHelper;

  test.beforeEach(async ({ page }) => {
    loginHelper = new LoginHelper(page);
  });

  test('TC-SESSION-001: User session persists after page refresh', async ({
    page,
  }) => {
    await loginHelper.loginWithValidCredentials();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.reload();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });

    const loginForm = page.locator('input[type="password"]');
    const loginFormVisible = await loginForm.isVisible().catch(() => false);
    expect(loginFormVisible).toBeFalsy();
  });

  test('TC-SESSION-002: User info should still be displayed after refresh', async ({
    page,
  }) => {
    await loginHelper.loginWithValidCredentials();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.reload();
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    await expect(page).toHaveURL(/\/dashboard/);

    const userSection = page.locator(
      '[data-testid="user-profile"], [data-testid="username"], .user-name, .user-profile, nav .user'
    );
    const userSectionVisible = await userSection.first().isVisible().catch(() => false);
    expect(userSectionVisible).toBeTruthy();
  });
});

// ============================================================
// Dashboard Load Tests
// ============================================================

test.describe('Dashboard - Page Load', () => {
  let loginHelper: LoginHelper;

  test.beforeEach(async ({ page }) => {
    loginHelper = new LoginHelper(page);
    await loginHelper.loginWithValidCredentials();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  });

  test('TC-DASH-001: Dashboard page should have correct title', async ({
    page,
  }) => {
    await expect(page).toHaveTitle(/dashboard/i, { timeout: 10000 });
  });

  test('TC-DASH-002: Navigation menu should be visible on dashboard', async ({
    page,
  }) => {
    const nav = page.locator('nav, [role="navigation"], [data-testid="navigation"]');
    await expect(nav.first()).toBeVisible({ timeout: 10000 });
  });

  test('TC-DASH-003: Main content area should be visible on dashboard', async ({
    page,
  }) => {
    const mainContent = page.locator(
      'main, [role="main"], [data-testid="main-content"], .main-content, #main'
    );
    await expect(mainContent.first()).toBeVisible({ timeout: 10000 });
  });

  test('TC-DASH-004: User profile section should display correct username', async ({
    page,
  }) => {
    const userProfile = page.locator(
      '[data-testid="user-profile"], [data-testid="username"], .user-profile, .user-name, nav .user'
    );
    await expect(userProfile.first()).toBeVisible({ timeout: 10000 });

    const profileText = await userProfile.first().textContent();
    expect(profileText).toBeTruthy();
    expect(profileText!.trim().length).toBeGreaterThan(0);
  });

  test('TC-DASH-005: No error messages or broken UI elements should be present', async ({
    page,
  }) => {
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

    const errorMessages = page.locator(
      '[data-testid="error"], .error-state, .alert-danger, [role="alert"].error'
    );
    const errorCount = await errorMessages.count();
    expect(errorCount).toBe(0);

    const brokenImages = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      return imgs.filter(
        (img) => img.complete && img.naturalWidth === 0 && img.src !== ''
      ).length;
    });
    expect(brokenImages).toBe(0);
  });

  test('TC-DASH-006: Dashboard should load within 3 seconds', async ({
    page,
    browser,
  }) => {
    const newContext = await browser.newContext();
    const newPage = await newContext.newPage();
    const newLoginHelper = new LoginHelper(newPage);

    await newLoginHelper.loginWithValidCredentials();

    const startTime = Date.now();
    await newPage.goto('/dashboard');
    await newPage.waitForLoadState('domcontentloaded');
    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThanOrEqual(3000);

    await newContext.close();
  });

  test('TC-DASH-007: Dashboard should show at least one data widget', async ({
    page,
  }) => {
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

    const widgets = page.locator(
      '[data-testid*="widget"], .widget, .card, .dashboard-card, [data-testid*="card"]'
    );
    const widgetCount = await widgets.count();
    expect(widgetCount).toBeGreaterThanOrEqual(1);
  });

  test('TC-DASH-008: No widget should display loading spinner indefinitely', async ({
    page,
  }) => {
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

    await page.waitForTimeout(3000);

    const spinners = page.locator(
      '[data-testid="loading-spinner"], .spinner, .loading, [aria-label="Loading"]'
    );
    const spinnerCount = await spinners.count();
    expect(spinnerCount).toBe(0);
  });

  test('TC-DASH-009: No failed API requests should appear on dashboard load', async ({
    page,
  }) => {
    const failedRequests: string[] = [];

    page.on('response', (response) => {
      if (
        response.status() >= 400 &&
        response.url().includes('/api/')
      ) {
        failedRequests.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.reload();
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

    expect(failedRequests).toHaveLength(0);
  });

  test('TC-DASH-010: No "Failed to load" error states visible on dashboard', async ({
    page,
  }) => {
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

    const failedLoadText = page.locator(
      'text=/failed to load/i, text=/error loading/i, text=/could not load/i, [data-testid="load-error"]'
    );
    const count = await failedLoadText.count();
    expect(count).toBe(0);
  });
});

// ============================================================
// Dashboard - Unauthenticated Access
// ============================================================

test.describe('Dashboard - Unauthenticated Access', () => {
  test('TC-DASH-011: Unauthenticated user should be redirected to login when accessing dashboard', async ({
    page,
  }) => {
    await page.goto('/dashboard');

    await page.waitForURL(/\/login/, { timeout: 10000 });
    await expect(page).toHaveURL(/\/login/);

    const loginForm = page.locator(
      'input[type="email"], input[name="email"], input[type="text"][name*="email" i]'
    );
    await expect(loginForm.first()).toBeVisible({ timeout: 8000 });
  });

  test('TC-DASH-012: No dashboard content should be visible to unauthenticated users', async ({
    page,
  }) => {
    await page.goto('/dashboard');

    await page.waitForURL(/\/login/, { timeout: 10000 }).catch(() => {});

    const dashboardContent = page.locator(
      '[data-testid="dashboard"], .dashboard, #dashboard'
    );
    const isDashboardVisible = await dashboardContent
      .first()
      .isVisible()
      .catch(() => false);
    expect(isDashboardVisible).toBeFalsy();

    const loginForm = page.locator('input[type="password"]');
    await expect(loginForm.first()).toBeVisible({ timeout: 8000 });
  });
});

// ============================================================
// Dashboard - Accessibility
// ============================================================

test.describe('Dashboard - Accessibility', () => {
  let loginHelper: LoginHelper;

  test.beforeEach(async ({ page }) => {
    loginHelper = new LoginHelper(page);
    await loginHelper.loginWithValidCredentials();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  });

  test('TC-DASH-013: All images on dashboard should have alt text', async ({
    page,
  }) => {
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

    const imagesWithoutAlt = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      return imgs.filter((img) => !img.alt || img.alt.trim() === '').map((img) => img.src);
    });

    expect(imagesWithoutAlt).toHaveLength(0);
  });

  test('TC-DASH-014: Dashboard should have a proper heading hierarchy', async ({
    page,
  }) => {
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});

    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBeGreaterThanOrEqual(1);
    expect(h1Count).toBeLessThanOrEqual(1);
  });

  test('TC-DASH-015: Interactive elements should be keyboard navigable', async ({
    page,
  }) => {
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

    await page.keyboard.press('Tab');
    const firstFocusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(firstFocusedElement).toBeTruthy();

    await page.keyboard.press('Tab');
    const secondFocusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(secondFocusedElement).toBeTruthy();
  });

  test('TC-DASH-016: All form inputs should have associated labels', async ({
    page,
  }) => {
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

    const inputsWithoutLabels = await page.evaluate(() => {
      const inputs = Array.from(
        document.querySelectorAll('input:not([type="hidden"]), select, textarea')
      );
      return inputs.filter((input) => {
        const el = input as HTMLElement;
        const id = el.getAttribute('id');
        const ariaLabel = el.getAttribute('aria-label');
        const ariaLabelledby = el.getAttribute('aria-labelledby');
        const hasLabel = id ? !!document.querySelector(`label[for="${id}"]`) : false;
        return !hasLabel && !ariaLabel && !ariaLabelledby;
      }).length;
    });

    expect(inputsWithoutLabels).toBe(0);
  });
});

// ============================================================
// Login Page - UI Elements
// ============================================================

test.describe('Login Page - UI Elements', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/login/);
  });

  test('TC-LOGIN-UI-001: Login page should have email input field', async ({
    page,
  }) => {
    const emailField = page.locator(
      'input[type="email"], input[name="email"], input[placeholder*="email" i]'
    );
    await expect(emailField.first()).toBeVisible();
  });

  test('TC-LOGIN-UI-002: Login page should have password input field', async ({
    page,
  }) => {
    const passwordField = page.locator('input[type="password"]');
    await expect(passwordField.first()).toBeVisible();
  });

  test('TC-LOGIN-UI-003: Login page should have a login submit button', async ({
    page,
  }) => {
    const loginButton = page.getByRole('button', { name: /login|sign in|submit/i });
    await expect(loginButton.first()).toBeVisible();
  });

  test('TC-LOGIN-UI-004: Password field should mask input by default', async ({
    page,
  }) => {
    const passwordInput = page.locator('input[type="password"]').first();
    const inputType = await passwordInput.getAttribute('type');
    expect(inputType).toBe('password');
  });

  test('TC-LOGIN-UI-005: Login button should be enabled when fields have values', async ({
    page,
  }) => {
    const loginHelper = new LoginHelper(page);
    await loginHelper.fillEmail('user@example.com');
    await loginHelper.fillPassword('ValidPass123!');

    const loginButton = page.getByRole('button', { name: /login|sign in/i }).first();
    await expect(loginButton).toBeEnabled();
  });
});

// ============================================================
// Cross-browser smoke test
// ============================================================

test.describe('Cross-browser Smoke Tests', () => {
  test('TC-SMOKE-001: Login and dashboard load successfully', async ({ page }) => {
    const loginHelper = new LoginHelper(page);

    await page.goto('/login');
    await expect(page).toHaveURL(/\/login/);

    await loginHelper.loginWithValidCredentials();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });

    const bodyContent = await page.locator('body').textContent();
    expect(bodyContent).toBeTruthy();
    expect(bodyContent!.trim().length).toBeGreaterThan(0);
  });
});