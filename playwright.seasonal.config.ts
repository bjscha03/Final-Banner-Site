import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: ['seasonal-campaign-matrix.playwright.spec.ts'],
  fullyParallel: true,
  workers: 4,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['line']],
  use: {
    baseURL: 'http://127.0.0.1:4177',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 4177',
    url: 'http://127.0.0.1:4177/',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop-1440x1000', use: { ...devices['Desktop Chrome'], browserName: 'chromium', viewport: { width: 1440, height: 1000 } } },
    { name: 'laptop-1280x800', use: { ...devices['Desktop Chrome'], browserName: 'chromium', viewport: { width: 1280, height: 800 } } },
    { name: 'iphone-390x844', use: { ...devices['iPhone 15 Pro'], browserName: 'webkit', viewport: { width: 390, height: 844 } } },
    { name: 'android-412x915', use: { ...devices['Pixel 8'], browserName: 'chromium', viewport: { width: 412, height: 915 } } },
  ],
});
