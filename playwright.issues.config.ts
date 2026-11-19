import { defineConfig, devices } from '@playwright/test';
const baseURL = process.env.ISSUE_QA_BASE_URL || 'http://127.0.0.1:4177';
export default defineConfig({
  testDir: './tests/browser', testMatch: 'site-issues-recovery.playwright.spec.ts',
  workers: 2, retries: 0, timeout: 60_000, expect: { timeout: 20_000 }, reporter: 'line',
  use: { baseURL, trace: 'retain-on-failure' },
  webServer: process.env.ISSUE_QA_BASE_URL ? undefined : {
    command: 'node scripts/issue-browser-server.mjs', url: baseURL, reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {} } },
    { name: 'mobile-safari', use: { ...devices['iPhone 15 Pro'], browserName: 'webkit' } },
  ],
});
