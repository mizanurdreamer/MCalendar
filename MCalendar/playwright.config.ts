import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

export default defineConfig({
  testDir: './E2ETests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  projects: [
    /* ---------- Auth setup ---------- */
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },

    /* ---------- Unauthenticated tests ---------- */
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* ---------- Authenticated as SUPER_ADMIN ---------- */
    {
      name: 'admin-chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'E2ETests/.auth/admin.json',
      },
      dependencies: ['setup'],
    },

    /* ---------- Authenticated as CLIENT ---------- */
    {
      name: 'client-chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'E2ETests/.auth/client.json',
      },
      dependencies: ['setup'],
    },

    /* ---------- Authenticated as ROOM_ATTENDANT ---------- */
    {
      name: 'attendant-chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'E2ETests/.auth/attendant.json',
      },
      dependencies: ['setup'],
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
