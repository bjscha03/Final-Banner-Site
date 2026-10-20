import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', testMatch: 'checkout-redesign.playwright.spec.ts',
  fullyParallel: true, workers: 4, timeout: 90_000, expect: { timeout: 20_000 },
  reporter: [['line']],
  use: { baseURL: 'http://127.0.0.1:4189', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'npx vite --config tests/browser/vite.checkout.config.ts', url: 'http://127.0.0.1:4189', reuseExistingServer: !process.env.CI, timeout: 120_000 },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 1050 } } },
    { name: 'tablet', use: { browserName: 'chromium', viewport: { width: 1024, height: 1000 } } },
    { name: 'mobile', use: { ...devices['iPhone 15 Pro'], browserName: 'webkit' } },
    { name: 'firefox', use: { browserName: 'firefox', viewport: { width: 1440, height: 1050 } } },
    { name: 'android', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'small-phone', use: { browserName: 'chromium', viewport: { width: 320, height: 740 } } },
  ],
});
