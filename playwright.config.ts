import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

// End-to-end tests (npm run test:e2e). See e2e/README.md.
//
// Settings come from .env (the app's own) and .env.e2e (test-only, git-
// ignored). The Clerk secret key, needed only for the signed-in tests, is
// read from .env.e2e or, if it isn't there, from the backend's .env next to
// this repo. Nothing here is ever printed.
dotenv.config({ path: '.env', quiet: true });
dotenv.config({ path: '.env.e2e', override: true, quiet: true });
if (!process.env.CLERK_SECRET_KEY) {
  const backendEnv = path.resolve(process.cwd(), '../AniSkolar_Backend/.env');
  if (fs.existsSync(backendEnv)) {
    const secret = dotenv.parse(fs.readFileSync(backendEnv)).CLERK_SECRET_KEY;
    if (secret) process.env.CLERK_SECRET_KEY = secret;
  }
}
process.env.CLERK_PUBLISHABLE_KEY ??= process.env.VITE_CLERK_PUBLISHABLE_KEY;

const PORT = 3000;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global.setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    // iPhone-sized, in Chromium (one browser to install).
    { name: 'phone', use: { ...devices['iPhone 15'], browserName: 'chromium' } },
  ],
  // Uses the dev server if it's already running, otherwise starts it.
  webServer: {
    command: 'npm run dev',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
