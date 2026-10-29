import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', testMatch: 'backdrop-landing.playwright.spec.ts',
  timeout: 60_000, expect: { timeout: 15_000 }, workers: 3, fullyParallel: true,
  reporter: [['line']],
  use: { baseURL: 'http://127.0.0.1:4190', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'npx vite preview --host 127.0.0.1 --port 4190', url: 'http://127.0.0.1:4190', reuseExistingServer: !process.env.CI, timeout: 60_000 },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 } } },
    { name: 'narrow-mobile', use: { browserName: 'chromium', viewport: { width: 320, height: 700 } } },
  ],
});
