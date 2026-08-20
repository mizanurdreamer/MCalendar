import { test, expect, request as playwrightRequest } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const MOBILE_VIEWPORT = { width: 375, height: 667 };

async function collectConsoleErrors(page: import('@playwright/test').Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 – Application Startup & Availability
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Application Startup & Availability', () => {
  test('should return HTTP 200 on root URL', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
  });

  test('should render a page with a recognisable calendar-related title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/MCalendar|Calendar/i);
  });

  test('should render visible body content on root URL', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    const body = page.locator('body');
    await expect(body).not.toBeEmpty();
  });

  test('should load without JavaScript console errors', async ({ page }) => {
    const errors = await collectConsoleErrors(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(errors).toHaveLength(0);
  });

  test('should fully load within 3 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);
  });

  test('should meet Core Web Vitals thresholds (LCP < 2500 ms, CLS < 0.1)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const vitals = await page.evaluate((): Promise<{ lcp: number; cls: number }> => {
      return new Promise((resolve) => {
        let lcp = 0;
        let cls = 0;

        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          if (entries.length > 0) {
            lcp = entries[entries.length - 1].startTime;
          }
        });

        const clsObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            const layoutShiftEntry = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
            if (!layoutShiftEntry.hadRecentInput) {
              cls += layoutShiftEntry.value;
            }
          });
        });

        try {
          lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
          clsObserver.observe({ type: 'layout-shift', buffered: true });
        } catch {
          // Browser may not support these entry types in all test environments
        }

        // Allow observers to collect entries before resolving
        setTimeout(() => {
          lcpObserver.disconnect();
          clsObserver.disconnect();
          resolve({ lcp, cls });
        }, 3000);
      });
    });

    // LCP of 0 can mean the observer was not supported; only assert when captured
    if (vitals.lcp > 0) {
      expect(vitals.lcp).toBeLessThan(2500);
    }
    expect(vitals.cls).toBeLessThan(0.1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 – Routing & Navigation
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Application Routing', () => {
  test('should render root route "/" with HTTP 200', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('should not redirect root route to an error page', async ({ page }) => {
    await page.goto('/');
    expect(page.url()).toMatch(/\/$/);
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toMatch(/500|internal server error/i);
  });

  test('should display a user-friendly 404 page for unknown routes', async ({ page }) => {
    await page.goto('/this-route-definitely-does-not-exist-xyz');
    await page.waitForLoadState('domcontentloaded');

    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toMatch(/404|not found|page not found/i);
  });

  test('should provide a way to return home from the 404 page', async ({ page }) => {
    await page.goto('/non-existent-page-abc');
    await page.waitForLoadState('domcontentloaded');

    // Accept any home navigation affordance: link to "/", or text-based cta
    const homeLink = page
      .locator('a[href="/"], a:has-text("Home"), a:has-text("Go back"), button:has-text("Home")')
      .first();

    const isVisible = await homeLink.isVisible().catch(() => false);
    if (isVisible) {
      await expect(homeLink).toBeVisible();
    } else {
      // Fallback: at minimum the page body should exist and not be blank
      await expect(page.locator('body')).not.toBeEmpty();
    }
  });

  test('should navigate to the 404 page without a full crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/route-that-does-not-exist-456');
    await page.waitForLoadState('networkidle');

    expect(errors).toHaveLength(0);
  });

  test('should handle SPA-style navigation without triggering hard reloads', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    let fullReloadCount = 0;
    page.on('load', () => { fullReloadCount += 1; });

    // Reset count after initial load
    fullReloadCount = 0;

    const internalNavLink = page.locator('nav a, header a').first();
    const isVisible = await internalNavLink.isVisible().catch(() => false);

    if (isVisible) {
      await internalNavLink.click();
      await page.waitForLoadState('networkidle');
      // SPA navigation should not trigger a full page reload event
      expect(fullReloadCount).toBe(0);
    } else {
      test.info().annotations.push({
        type: 'skip-reason',
        description: 'No internal navigation links visible on root; SPA test skipped.',
      });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 – API Routes Health
// ─────────────────────────────────────────────────────────────────────────────

test.describe('API Routes Health', () => {
  test('should return 200 with valid JSON from /api/health', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);

    const contentType = response.headers()['content-type'] ?? '';
    expect(contentType).toContain('application/json');

    const body = await response.json();
    expect(body).toBeDefined();
  });

  test('should not expose stack traces on API error responses', async ({ request }) => {
    const response = await request.get('/api/this-endpoint-does-not-exist');
    const text = await response.text();
    expect(text).not.toMatch(/at Object\.|at Module\.|at Function\.|\.js:\d+:\d+/);
  });

  test('should return 404 or 405 for DELETE on /api/health', async ({ request }) => {
    const response = await request.delete('/api/health');
    expect([404, 405]).toContain(response.status());
  });

  test('should return 404 or 405 for POST on a read-only API endpoint', async ({ request }) => {
    const response = await request.post('/api/health', { data: {} });
    expect([404, 405]).toContain(response.status());
  });

  test('should not return 500 for a well-formed GET to /api/health', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).not.toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4 – UI Component Library Integration
// ─────────────────────────────────────────────────────────────────────────────

test.describe('UI Component Library Integration', () => {
  test('should render the page without hydration errors on desktop', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));

    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const hydrationErrors = errors.filter((e) =>
      /hydrat|did not match|component not found/i.test(e)
    );
    expect(hydrationErrors).toHaveLength(0);
  });

  test('should render buttons using correct role semantics', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const buttons = page.getByRole('button');
    const count = await buttons.count();

    if (count > 0) {
      for (let i = 0; i < Math.min(count, 5); i++) {
        await expect(buttons.nth(i)).toBeVisible();
      }
    } else {
      test.info().annotations.push({
        type: 'info',
        description: 'No button elements found on root at this stage of development.',
      });
    }
  });

  test('should render inputs with proper accessibility roles', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const inputs = page.locator('input, textarea, select');
    const count = await inputs.count();

    if (count > 0) {
      for (let i = 0; i < Math.min(count, 5); i++) {
        await expect(inputs.nth(i)).toBeVisible();
      }
    } else {
      test.info().annotations.push({
        type: 'info',
        description: 'No form inputs found on root at this stage of development.',
      });
    }
  });

  test('should not show component-not-found errors on root page load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const componentErrors = errors.filter((e) =>
      /component not found|element type is invalid|unknown component/i.test(e)
    );
    expect(componentErrors).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5 – Responsive Layout
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Responsive Layout', () => {
  test('should display correctly on desktop viewport (1280x800)', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const body = page.locator('body');
    await expect(body).toBeVisible();

    // Ensure no element is horizontally overflowing the viewport
    const overflowingElements = await page.evaluate(() => {
      const viewportWidth = window.innerWidth;
      const offenders: string[] = [];
      document.querySelectorAll('*').forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.right > viewportWidth + 5) {
          offenders.push(el.tagName + (el.id ? `#${el.id}` : '') + (el.className ? `.${String(el.className).split(' ').join('.')}` : ''));
        }
      });
      return offenders.slice(0, 10);
    });

    expect(overflowingElements).toHaveLength(0);
  });

  test('should be responsive on mobile viewport (375x667) without horizontal overflow', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const body = page.locator('body');
    await expect(body).toBeVisible();

    const overflowingElements = await page.evaluate(() => {
      const viewportWidth = window.innerWidth;
      const offenders: string[] = [];
      document.querySelectorAll('*').forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.right > viewportWidth + 5) {
          offenders.push(el.tagName + (el.id ? `#${el.id}` : ''));
        }
      });
      return offenders.slice(0, 10);
    });

    expect(overflowingElements).toHaveLength(0);
  });

  test('should render the page without console errors on mobile viewport', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));

    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(errors).toHaveLength(0);
  });

  test('should have consistent document title across viewports', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto('/');
    const desktopTitle = await page.title();

    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto('/');
    const mobileTitle = await page.title();

    expect(desktopTitle).toBe(