import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'light-product-heroes.playwright.spec.ts',
  fullyParallel: true,
  workers: 3,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  reporter: [['line']],
  use: { baseURL: 'http://127.0.0.1:4188', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 4188',
    url: 'http://127.0.0.1:4188',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 } } },
    { name: 'tablet', use: { browserName: 'chromium', viewport: { width: 1024, height: 900 } } },
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } } },
  ],
});
