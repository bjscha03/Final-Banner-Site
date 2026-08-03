import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4175';
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const localChromiumLaunch = chromiumExecutablePath
  ? { launchOptions: { executablePath: chromiumExecutablePath } }
  : {};

export default defineConfig({
  testDir: './tests/browser',
  testMatch: [
    'preview-handoff.playwright.spec.ts',
    'checkout-thumbnail-real-route.playwright.spec.ts',
  ],
  fullyParallel: true,
  workers: process.env.CI ? 4 : 2,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [['line']],
  use: {
    baseURL,
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite --config tests/browser/vite.handoff.config.ts',
    url: `${baseURL}/tests/browser/preview-handoff.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium-1440x900',
      use: {
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
        ...localChromiumLaunch,
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'chrome-1280x800',
      use: {
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
        channel: 'chrome',
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'edge-1280x800',
      use: {
        ...devices['Desktop Edge'],
        browserName: 'chromium',
        channel: 'msedge',
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'firefox-1280x800',
      use: {
        ...devices['Desktop Firefox'],
        browserName: 'firefox',
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'webkit-1280x800',
      use: {
        ...devices['Desktop Safari'],
        browserName: 'webkit',
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'webkit-iphone15pro-portrait',
      use: { ...devices['iPhone 15 Pro'], browserName: 'webkit' },
    },
    {
      name: 'webkit-iphone15pro-landscape',
      use: { ...devices['iPhone 15 Pro landscape'], browserName: 'webkit' },
    },
    {
      name: 'webkit-iphonese-portrait',
      use: { ...devices['iPhone SE (3rd gen)'], browserName: 'webkit' },
    },
    {
      name: 'chromium-pixel8-portrait',
      use: { ...devices['Pixel 8'], browserName: 'chromium', ...localChromiumLaunch },
    },
    {
      name: 'chromium-pixel8-landscape',
      use: { ...devices['Pixel 8 landscape'], browserName: 'chromium', ...localChromiumLaunch },
    },
    {
      name: 'webkit-ipad11-portrait',
      use: { ...devices['iPad (gen 11)'], browserName: 'webkit' },
    },
    {
      name: 'webkit-ipad11-landscape',
      use: { ...devices['iPad (gen 11) landscape'], browserName: 'webkit' },
    },
    {
      name: 'chromium-galaxy-tab-s9-portrait',
      use: { ...devices['Galaxy Tab S9'], browserName: 'chromium', ...localChromiumLaunch },
    },
    {
      name: 'chromium-galaxy-tab-s9-landscape',
      use: { ...devices['Galaxy Tab S9 landscape'], browserName: 'chromium', ...localChromiumLaunch },
    },
  ],
});
