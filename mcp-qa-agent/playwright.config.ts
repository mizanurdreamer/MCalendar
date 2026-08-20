import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// process.cwd() returns the current working directory of the process
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export default defineConfig({
  testDir: './MCalendar/tests',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
  },
});