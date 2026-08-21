import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Load the app root .env so tests can use BASE_URL / JWT_ACCESS_SECRET etc.
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// Config for running tests from inside E2ETests/ (e.g. by MCalendar-Agent).
// The root playwright.config.ts is used when running from the app root;
// Playwright only auto-loads a config from the current working directory,
// so this file makes standalone E2ETests runs self-sufficient.
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    cwd: path.resolve(__dirname, '..'),
    url: process.env.BASE_URL || 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
