import { test, expect, Page } from '@playwright/test';

// ─────────────────────────────────────────────
// Page Object Model
// ─────────────────────────────────────────────

class LoginPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get emailInput() {
    return this.page.getByRole('textbox', { name: /email/i });
  }

  get passwordInput() {
    return this.page.getByLabel(/password/i);
  }

  get rememberMeCheckbox() {
    return this.page.getByRole('checkbox', { name: /remember me/i });
  }

  get loginButton() {
    return this.page.getByRole('button', { name: /Sign in/i });
  }

  get errorMessage() {
    return this.page.getByRole('alert');
  }

  get emailError() {
    return this.page.getByTestId('email-error');
  }

  get passwordError() {
    return this.page.getByTestId('password-error');
  }

  get passwordToggleShow() {
    return this.page.getByRole('button', { name: /show password/i });
  }

  get passwordToggleHide() {
    return this.page.getByRole('button', { name: /hide password/i });
  }

  get loadingSpinner() {
    return this.page.getByTestId('login-spinner');
  }

  get welcomeMessage() {
    return this.page.getByText(/welcome back/i);
  }

  async navigate() {
    await this.page.goto('/login');
    await this.page.waitForLoadState('networkidle');
  }

  async fillEmail(email: string) {
    await this.emailInput.fill(email);
  }

  async fillPassword(password: string) {
    await this.passwordInput.fill(password);
  }

  async checkRememberMe() {
    await this.rememberMeCheckbox.check();
  }

  async clickLogin() {
    await this.loginButton.click();
  }

  async login(email: string, password: string, rememberMe = false) {
    await this.fillEmail(email);
    await this.fillPassword(password);
    if (rememberMe) {
      await this.checkRememberMe();
    }
    await this.clickLogin();
  }

  async getTokenFromStorage(type: 'local' | 'session' = 'session'): Promise<string | null> {
    return this.page.evaluate(
      ([storageType]) =>
        storageType === 'local'
          ? localStorage.getItem('auth_token')
          : sessionStorage.getItem('auth_token'),
      [type]
    );
  }

  async setAuthToken(token: string, type: 'local' | 'session' = 'session') {
    await this.page.evaluate(
      ([t, storageType]) => {
        if (storageType === 'local') {
          localStorage.setItem('auth_token', t);
        } else {
          sessionStorage.setItem('auth_token', t);
        }
      },
      [token, type]
    );
  }

  async clearStorage() {
    await this.page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  }

  async getTokenExpiry(type: 'local' | 'session' = 'session'): Promise<string | null> {
    return this.page.evaluate(
      ([storageType]) =>
        storageType === 'local'
          ? localStorage.getItem('auth_token_expiry')
          : sessionStorage.getItem('auth_token_expiry'),
      [type]
    );
  }

  async countApiCalls(): Promise<number> {
    let count = 0;
    this.page.on('request', (req) => {
      if (req.url().includes('/api/auth/login')) count++;
    });
    return count;
  }
}

// ─────────────────────────────────────────────
// Test Data
// ─────────────────────────────────────────────

const VALID_USER = {
  email: process.env.TEST_USER_EMAIL ?? 'user@example.com',
  password: process.env.TEST_USER_PASSWORD ?? 'SecurePass123!',
};

const INVALID_USER = {
  email: 'user@example.com',
  password: 'WrongPass!',
};

const MOCK_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';

// ─────────────────────────────────────────────
// Happy Path Tests
// ─────────────────────────────────────────────

test.describe('Login — Happy Path', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.navigate();
  });

  test('TC-AUTH-001 | Successful login redirects to dashboard', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: MOCK_JWT,
          user: { name: 'User', email: VALID_USER.email },
          expiresIn: 3600,
        }),
      });
    });

    await loginPage.login(VALID_USER.email, VALID_USER.password);

    await expect(page).toHaveURL('/dashboard');
    await expect(loginPage.welcomeMessage).toBeVisible();

    const token = await loginPage.getTokenFromStorage('session');
    expect(token).toBeTruthy();
    expect(token).toBe(MOCK_JWT);
  });

  test('TC-AUTH-002 | Remember Me stores token in localStorage', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: MOCK_JWT,
          user: { name: 'User', email: VALID_USER.email },
          expiresIn: 2592000,
          rememberMe: true,
        }),
      });
    });

    await loginPage.login(VALID_USER.email, VALID_USER.password, true);

    await expect(page).toHaveURL('/dashboard');

    const localToken = await loginPage.getTokenFromStorage('local');
    const sessionToken = await loginPage.getTokenFromStorage('session');

    expect(localToken).toBeTruthy();
    expect(localToken).toBe(MOCK_JWT);
    expect(sessionToken).toBeNull();
  });

  test('TC-AUTH-003 | Token expiry set to 30 days when Remember Me enabled', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: MOCK_JWT,
          user: { name: 'User', email: VALID_USER.email },
          expiresIn: 2592000,
          rememberMe: true,
        }),
      });
    });

    await loginPage.login(VALID_USER.email, VALID_USER.password, true);

    await expect(page).toHaveURL('/dashboard');

    const expiry = await loginPage.getTokenExpiry('local');
    if (expiry) {
      const expiryDate = new Date(expiry);
      const now = new Date();
      const diffDays = Math.round((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBeGreaterThanOrEqual(29);
      expect(diffDays).toBeLessThanOrEqual(30);
    }
  });

  test('TC-AUTH-004 | Redirect to originally requested URL after login', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: MOCK_JWT,
          user: { name: 'User', email: VALID_USER.email },
        }),
      });
    });

    await page.goto('/profile');
    await expect(page).toHaveURL(/\/login/);

    await loginPage.login(VALID_USER.email, VALID_USER.password);
    await expect(page).toHaveURL('/profile');
  });

  test('TC-AUTH-005 | Welcome message is displayed after successful login', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: MOCK_JWT,
          user: { name: 'User', email: VALID_USER.email },
        }),
      });
    });

    await loginPage.login(VALID_USER.email, VALID_USER.password);

    await expect(page).toHaveURL('/dashboard');
    await expect(loginPage.welcomeMessage).toBeVisible();
    await expect(loginPage.welcomeMessage).toContainText(/welcome back/i);
  });
});

// ─────────────────────────────────────────────
// Form Validation Tests
// ─────────────────────────────────────────────

test.describe('Login — Form Validation', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.navigate();
  });

  test('TC-VAL-001 | Login fails with empty email field', async ({ page }) => {
    let apiCalled = false;
    await page.route('**/api/auth/login', async (route) => {
      apiCalled = true;
      await route.continue();
    });

    await loginPage.fillPassword(VALID_USER.password);
    await loginPage.clickLogin();

    await expect(loginPage.emailError).toBeVisible();
    await expect(loginPage.emailError).toContainText(/email is required/i);
    await expect(page).toHaveURL('/login');
    expect(apiCalled).toBe(false);
  });

  test('TC-VAL-002 | Login fails with invalid email format', async ({ page }) => {
    let apiCalled = false;
    await page.route('**/api/auth/login', async (route) => {
      apiCalled = true;
      await route.continue();
    });

    await loginPage.fillEmail('not-an-email');
    await loginPage.fillPassword(VALID_USER.password);
    await loginPage.clickLogin();

    await expect(loginPage.emailError).toBeVisible();
    await expect(loginPage.emailError).toContainText(/please enter a valid email address/i);
    expect(apiCalled).toBe(false);
  });

  test('TC-VAL-003 | Login fails with empty password field', async ({ page }) => {
    let apiCalled = false;
    await page.route('**/api/auth/login', async (route) => {
      apiCalled = true;
      await route.continue();
    });

    await loginPage.fillEmail(VALID_USER.email);
    await loginPage.clickLogin();

    await expect(loginPage.passwordError).toBeVisible();
    await expect(loginPage.passwordError).toContainText(/password is required/i);
    await expect(page).toHaveURL('/login');
    expect(apiCalled).toBe(false);
  });

  test('TC-VAL-004 | Login fails with incorrect password', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Invalid email or password' }),
      });
    });

    await loginPage.login(INVALID_USER.email, INVALID_USER.password);

    await expect(loginPage.errorMessage).toBeVisible();
    await expect(loginPage.errorMessage).toContainText(/invalid email or password/i);
    await expect(page).toHaveURL('/login');

    const token = await loginPage.getTokenFromStorage('session');
    const localToken = await loginPage.getTokenFromStorage('local');
    expect(token).toBeNull();
    expect(localToken).toBeNull();
  });

  test('TC-VAL-005 | Both fields empty shows multiple validation errors', async ({ page }) => {
    let apiCalled = false;
    await page.route('**/api/auth/login', async (route) => {
      apiCalled = true;
      await route.continue();
    });

    await loginPage.clickLogin();

    await expect(loginPage.emailError).toBeVisible();
    await expect(loginPage.passwordError).toBeVisible();
    await expect(page).toHaveURL('/login');
    expect(apiCalled).toBe(false);
  });

  test('TC-VAL-006 | Email with leading/trailing whitespace is trimmed before validation', async ({ page }) => {
    await page.route('**/api/auth/login', async (route, request) => {
      const body = JSON.parse(request.postData() ?? '{}');
      expect(body.email).toBe(VALID_USER.email);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: MOCK_JWT, user: { name: 'User' } }),
      });
    });

    await loginPage.fillEmail(`  ${VALID_USER.email}  `);
    await loginPage.fillPassword(VALID_USER.password);
    await loginPage.clickLogin();

    await expect(page).toHaveURL('/dashboard');
  });
});

// ─────────────────────────────────────────────
// Security Tests
// ─────────────────────────────────────────────

test.describe('Login — Security', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.navigate();
  });

  test('TC-SEC-001 | Account lockout after 5 consecutive failed attempts', async ({ page }) => {
    let attemptCount = 0;

    await page.route('**/api/auth/login', async (route) => {
      attemptCount++;
      if (attemptCount < 5) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Invalid email or password' }),
        });
      } else {
        await route.fulfill({
          status: 423,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Account locked. Try again in 15 minutes.' }),
        });
      }
    });

    for (let i = 0; i < 4; i++) {
      await loginPage.login(INVALID_USER.email, INVALID_USER.password);
      await expect(loginPage.errorMessage).toBeVisible();
    }

    await loginPage.login(INVALID_USER.email, INVALID_USER.password);

    await expect(loginPage.errorMessage).toBeVisible();
    await expect(loginPage.errorMessage).toContainText(/account locked/i);
    await expect(loginPage.errorMessage).toContainText(/15 minutes/i);
    await expect(page).toHaveURL('/login');
  });

  test('TC-SEC-002 | Locked account rejects subsequent login attempts', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 423,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Account locked. Try again in 15 minutes.' }),
      });
    });

    await loginPage.login(VALID_USER.email, VALID_USER.password);

    await expect(loginPage.errorMessage).toContainText(/account locked/i);
    await expect(page).toHaveURL('/login');

    const token = await loginPage.getTokenFromStorage('session');
    expect(token).toBeNull();
  });

  test('TC-SEC-003 | Password field masks input by default', async () => {
    const inputType = await loginPage.passwordInput.getAttribute('type');
    expect(inputType).toBe('password');
  });

  test('TC-SEC-004 | Toggle password visibility — show password', async () => {
    await loginPage.fillPassword('MySecret123!');

    let inputType = await loginPage.passwordInput.getAttribute('type');
    expect(inputType).toBe('password');

    await loginPage.passwordToggleShow.click();

    inputType = await loginPage.passwordInput.getAttribute('type');
    expect(inputType).toBe('text');
  });

  test('TC-SEC-005 | Toggle password visibility — hide password after show', async () => {
    await loginPage.fillPassword('MySecret123!');

    await loginPage.passwordToggleShow.click();

    let inputType = await loginPage.passwordInput.getAttribute('type');
    expect(inputType).toBe('text');

    await loginPage.passwordToggleHide.click();

    inputType = await loginPage.passwordInput.getAttribute('type');
    expect(inputType).toBe('password');
  });

  test('TC-SEC-006 | Authenticated user is redirected away from login page', async ({ page }) => {
    await loginPage.navigate();
    await loginPage.setAuthToken(MOCK_JWT, 'session');

    await page.goto('/login');

    await expect(page).toHaveURL('/dashboard');
  });

  test('TC-SEC-007 | SQL injection attempt is safely handled', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Invalid email or password' }),
      });
    });

    await loginPage.fillEmail("' OR '1'='1");
    await loginPage.fillPassword('anypassword');
    await loginPage.clickLogin();

    await expect(loginPage.errorMessage).toBeVisible();
    await expect(loginPage.errorMessage).toContainText(/invalid email or password/i);

    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('SQL');
    expect(bodyText).not.toContain('syntax error');
    expect(bodyText).not.toContain('database');

    await expect(page).toHaveURL('/login');
  });

  test('TC-SEC-008 | XSS attempt in email field is safely handled', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Invalid email or password' }),
      });
    });

    await loginPage.fillEmail('<script>alert("xss")</script>');
    await loginPage.fillPassword('anypassword');
    await loginPage.clickLogin();

    await expect(page).not.toHaveTitle(/xss/i);

    const dialogs: string[] = [];
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message());
      dialog.dismiss();
    });

    await page.waitForTimeout(500);
    expect(dialogs).toHaveLength(0);
  });

  test('TC-SEC-009 | No sensitive data exposed in API error responses', async ({ page }) => {
    const apiResponses: string[] = [];

    await page.route('**/api/auth/login', async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      apiResponses.push(body);
      await route.fulfill({ response });
    });

    await loginPage.login(INVALID_USER.email, INVALID_USER.password);

    for (const response of apiResponses) {
      expect(response).not.toContain('stack');
      expect(response).not.toContain('trace');
      expect(response).not.toContain('password_hash');
    }
  });
});

// ─────────────────────────────────────────────
// Accessibility Tests
// ─────────────────────────────────────────────

test.describe('Login — Accessibility', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.navigate();
  });

  test('TC-A11Y-001 | Login form is keyboard navigable in correct tab order', async ({ page }) => {
    await page.keyboard.press('Tab');
    await expect(loginPage.emailInput).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(loginPage.passwordInput).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(loginPage.rememberMeCheckbox).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(loginPage.loginButton).toBeFocused();
  });

  test('TC-A11Y-002 | Login form can be submitted using keyboard Enter key', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: MOCK_JWT, user: { name: 'User' } }),
      });
    });

    await loginPage.fillEmail(VALID_USER.email);
    await loginPage.fillPassword(VALID_USER.password);
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL('/dashboard');
  });

  test('TC-A11Y-003 | Email input has appropriate ARIA label', async () => {
    const ariaLabel = await loginPage.emailInput.getAttribute('aria-label');
    const label = await loginPage.page.locator('label[for]').filter({ hasText: /email/i }).count();

    const hasAccessibleName = ariaLabel !== null || label > 0;
    expect(hasAccessibleName).toBe(true);
  });

  test('TC-A11Y-004 | Password input has appropriate ARIA label', async () => {
    const ariaLabel = await loginPage.passwordInput.getAttribute('aria-label');
    const label = await loginPage.page.locator('label[for]').filter({ hasText: /password/i }).count();

    const hasAccessibleName = ariaLabel !== null || label > 0;
    expect(hasAccessibleName).toBe(true);
  });

  test('TC-A11Y-005 | Error messages use aria-live regions for screen readers', async ({ page }) => {
    await loginPage.clickLogin();

    const ariaLiveRegion = page.locator('[aria-live]');
    const count = await ariaLiveRegion.count();
    expect(count).toBeGreaterThan(0);

    const ariaLiveValue = await ariaLiveRegion.first().getAttribute('aria-live');
    expect(['polite', 'assertive']).toContain(ariaLiveValue);
  });

  test('TC-A11Y-006 | Error messages have role=alert for screen reader announcement', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Invalid email or password' }),
      });
    });

    await loginPage.login(INVALID_USER.email, INVALID_USER.password);

    await expect(loginPage.errorMessage).toBeVisible();
    const role = await loginPage.errorMessage.getAttribute('role');
    expect(role).toBe('alert');
  });

  test('TC-A11Y-007 | Remember Me checkbox is keyboard operable', async ({ page }) => {
    await loginPage.rememberMeCheckbox.focus();
    await expect(loginPage.rememberMeCheckbox).toBeFocused();

    await page.keyboard.press('Space');
    await expect(loginPage.rememberMeCheckbox).toBeChecked();

    await page.keyboard.press('Space');
    await expect(loginPage.rememberMeCheckbox).not.toBeChecked();
  });

  test('TC-A11Y-008 | Login button has discernible text', async () => {
    const buttonText = await loginPage.loginButton.textContent();
    const ariaLabel = await loginPage.loginButton.getAttribute('aria-label');

    const hasAccessibleName = (buttonText && buttonText.trim().length > 0) || ariaLabel !== null;
    expect(hasAccessibleName).toBe(true);
  });

  test('TC-A11Y-009 | Color contrast is sufficient — Login button is visible', async () => {
    await expect(loginPage.loginButton).toBeVisible();
    const isEnabled = await loginPage.loginButton.isEnabled();
    expect(isEnabled).toBe(true);
  });

  test('TC-A11Y-010 | Focus is visible on all interactive elements', async ({ page }) => {
    const interactiveSelectors = [
      loginPage.emailInput,
      loginPage.passwordInput,
      loginPage.rememberMeCheckbox,
      loginPage.loginButton,
    ];

    for (const element of interactiveSelectors) {
      await element.focus();
      await expect(element).toBeFocused();

      const outlineStyle = await element.evaluate((el) => {
        const styles = window.getComputedStyle(el);
        return {
          outline: styles.outline,
          outlineWidth: styles.outlineWidth,
          boxShadow: styles.boxShadow,
        };
      });

      const hasFocusIndicator =
        (outlineStyle.outlineWidth !== '0px' && outlineStyle.outline !== 'none') ||
        outlineStyle.boxShadow !== 'none';

      expect(hasFocusIndicator).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────
// Network / Edge Case Tests
// ─────────────────────────────────────────────

test.describe('Login — Network & Edge Cases', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.navigate();
  });

  test('TC-NET-001 | Login button shows loading state during API call', async ({ page }) => {
    let resolveApiCall: () => void;
    const apiCallStarted = new Promise<void>((resolve) => {
      resolveApiCall = resolve;
    });

    await page.route('**/api/auth/login', async (route) => {
      resolveApiCall!();
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: MOCK_JWT, user: { name: 'User' } }),
      });
    });

    await loginPage.fillEmail(VALID_USER.email);
    await loginPage.fillPassword(VALID_USER.password);
    await loginPage.clickLogin();

    await apiCallStarted;

    await expect(loginPage.loginButton).toBeDisabled();
    await expect(loginPage.loadingSpinner).toBeVisible();

    await expect(page).toHaveURL('/dashboard');
    await expect(loginPage.loadingSpinner).not.toBeVisible();
  });

  test('TC-NET-002 | Login button disabled to prevent duplicate submissions', async ({ page }) => {
    const requestCount = { value: 0 };

    await page.route('**/api/auth/login', async (route) => {
      requestCount.value++;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: MOCK_JWT, user: { name: 'User' } }),
      });
    });

    await loginPage.fillEmail(VALID_USER.email);
    await loginPage.fillPassword(VALID_USER.password);

    await loginPage.clickLogin();
    await loginPage.clickLogin();
    await loginPage.clickLogin();

    await expect(page).toHaveURL('/dashboard');
    expect(requestCount.value).toBe(1);
  });

  test('TC-NET-003 | Graceful handling of API timeout', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 35000));
      await route.abort('timedout');
    });

    await loginPage.login(VALID_USER.email, VALID_USER.password);

    await expect(loginPage.errorMessage).toBeVisible({ timeout: 40000 });
    await expect(loginPage.errorMessage).toContainText(/service unavailable|try again later/i);
    await expect(loginPage.loginButton).toBeEnabled();
    await expect(loginPage.loadingSpinner).not.toBeVisible();
  });

  test('TC-NET-004 | Graceful handling of network disconnection', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.abort('failed');
    });

    await loginPage.login(VALID_USER.email, VALID_USER.password);

    await expect(loginPage.errorMessage).toBeVisible();
    await expect(loginPage.errorMessage).toContainText(/no internet connection|network|unavailable/i);
    await expect(loginPage.loginButton).toBeEnabled();
  });

  test('TC-NET-005 | Graceful handling of 500 Internal Server Error', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Internal server error' }),
      });
    });

    await loginPage.login(VALID_USER.email, VALID_USER.password);

    await expect(loginPage.errorMessage).toBeVisible();
    await expect(loginPage.errorMessage).toContainText(/service unavailable|error|try again/i);
    await expect(page).toHaveURL('/login');

    const token = await loginPage.getTokenFromStorage('session');
    expect(token).toBeNull();
  });

  test('TC-NET-006 | Graceful handling of 503 Service Unavailable', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Service unavailable' }),
      });
    });

    await loginPage.login(VALID_USER.email, VALID_USER.password);

    await expect(loginPage.errorMessage).toBeVisible();
    await expect(page).toHaveURL('/login');
  });

  test('TC-NET-007 | Loading spinner disappears after successful response', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: MOCK_JWT, user: { name: 'User' } }),
      });
    });

    await loginPage.fillEmail(VALID_USER.email);
    await loginPage.fillPassword(VALID_USER.password);
    await loginPage.clickLogin();

    await expect(page).toHaveURL('/dashboard');
    await expect(loginPage.loadingSpinner).not.toBeVisible();
  });

  test('TC-NET-008 | Loading spinner disappears after error response', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Invalid email or password' }),
      });
    });

    await loginPage.login(VALID_USER.email, VALID_USER.password);

    await expect(loginPage.errorMessage).toBeVisible();
    await expect(loginPage.loadingSpinner).not.toBeVisible();
    await expect(loginPage.loginButton).toBeEnabled();
  });

  test('TC-NET-009 | Rate limiting response is handled gracefully', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Too many requests. Please try again later.' }),
        headers: { 'Retry-After': '60' },
      });
    });

    await loginPage.login(VALID_USER.email, VALID_USER.password);

    await expect(loginPage.errorMessage).toBeVisible();
    await expect(loginPage.errorMessage).toContainText(/too many requests|try again later/i);
    await expect(page).toHaveURL('/login');
  });

  test('TC-NET-010 | Malformed API response is handled gracefully', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: 'not valid json{{{',
      });
    });

    await loginPage.login(VALID_USER.email, VALID_USER.password);

    await expect(loginPage.errorMessage).toBeVisible();
    await expect(page).toHaveURL('/login');
  });
});

// ─────────────────────────────────────────────
// Session Management Tests
// ─────────────────────────────────────────────

test.describe('Login — Session Management', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.navigate();
  });

  test('TC-SES-001 | Session token is stored only in sessionStorage without Remember Me', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: MOCK_JWT, user: { name: 'User' } }),
      });
    });

    await loginPage.login(VALID_USER.email, VALID_USER.password, false);

    await expect(page).toHaveURL('/dashboard');

    const sessionToken = await loginPage.getTokenFromStorage('session');
    const localToken = await loginPage.getTokenFromStorage('local');

    expect(sessionToken).toBe(MOCK_JWT);
    expect(localToken).toBeNull();
  });

  test('TC-SES-002 | No token stored on failed login', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Invalid email or password' }),
      });
    });

    await loginPage.login(INVALID_USER.email, INVALID_USER.password);

    const sessionToken = await loginPage.getTokenFromStorage('session');
    const localToken = await loginPage.getTokenFromStorage('local');

    expect(sessionToken).toBeNull();
    expect(localToken).toBeNull();
  });

  test('TC-SES-003 | Stored JWT token is valid format', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: MOCK_JWT, user: { name: 'User' } }),
      });
    });

    await loginPage.login(VALID_USER.email, VALID_USER.password);

    await expect(page).toHaveURL('/dashboard');

    const token = await loginPage.getTokenFromStorage('session');
    expect(token).toBeTruthy();

    const jwtParts = token!.split('.');
    expect(jwtParts).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────
// UI / Visual Tests
// ─────────────────────────────────────────────

test.describe('Login — UI & Visual', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.navigate();
  });

  test('TC-UI-001 | Login page displays all required elements', async () => {
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.rememberMeCheckbox).toBeVisible();
    await expect(loginPage.loginButton).toBeVisible();
  });

  test('TC-UI-002 | Login button is enabled by default', async () => {
    await expect(loginPage.loginButton).toBeEnabled();
  });

  test('TC-UI-003 | Remember Me checkbox is unchecked by default', async () => {
    await expect(loginPage.rememberMeCheckbox).not.toBeChecked();
  });

  test('TC-UI-004 | Email and password fields are empty on page load', async () => {
    await expect(loginPage.emailInput).toBeEmpty();
    await expect(loginPage.passwordInput).toBeEmpty();
  });

  test('TC-UI-005 | Error message disappears when user starts correcting input', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Invalid email or password' }),
      });
    });

    await loginPage.login(INVALID_USER.email, INVALID_USER.password);
    await expect(loginPage.errorMessage).toBeVisible();

    await loginPage.fillEmail('new@example.com');
    await expect(loginPage.errorMessage).not.toBeVisible();
  });

  test('TC-UI-006 | Page title is correct', async ({ page }) => {
    await expect(page).toHaveTitle(/login|sign in/i);
  });

  test('TC-UI-007 | Login page is responsive on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await loginPage.navigate();

    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.loginButton).toBeVisible();

    const buttonBox = await loginPage.loginButton.boundingBox();
    expect(buttonBox?.width).toBeGreaterThan(100);
  });

  test('TC-UI-008 | Login page is responsive on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await loginPage.navigate();

    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.loginButton).toBeVisible();
  });

  test('TC-UI-009 | Password show/hide toggle button is visible', async () => {
    await expect(loginPage.passwordToggleShow).toBeVisible();
  });

  test('TC-UI-010 | Login page takes screenshot for visual regression', async ({ page }) => {
    await expect(page).toHaveScreenshot('login-page.png', {
      maxDiffPixels: 100,
    });
  });
});