import { defineConfig } from '@playwright/test';

const localExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const localExecutableArgs = process.env.PLAYWRIGHT_CHROMIUM_ARGS_JSON
  ? JSON.parse(process.env.PLAYWRIGHT_CHROMIUM_ARGS_JSON) as string[]
  : undefined;

export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'local-pages.playwright.spec.ts',
  fullyParallel: true,
  workers: process.env.CI ? 3 : 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['line']],
  use: {
    baseURL: 'http://127.0.0.1:4176',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: localExecutablePath
      ? { executablePath: localExecutablePath, args: localExecutableArgs }
      : undefined,
  },
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 4176',
    url: 'http://127.0.0.1:4176/vinyl-banners/louisville-ky/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'compact-mobile-320x700', use: { browserName: 'chromium', viewport: { width: 320, height: 700 } } },
    { name: 'mobile-390x844', use: { browserName: 'chromium', viewport: { width: 390, height: 844 } } },
    { name: 'large-mobile-430x932', use: { browserName: 'chromium', viewport: { width: 430, height: 932 } } },
    { name: 'tablet-768x1024', use: { browserName: 'chromium', viewport: { width: 768, height: 1024 } } },
    { name: 'small-desktop-1024x900', use: { browserName: 'chromium', viewport: { width: 1024, height: 900 } } },
    { name: 'desktop-1440x1000', use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } } },
  ],
});
