import { defineConfig, devices } from '@playwright/test';
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const webkitPath = process.env.PLAYWRIGHT_WEBKIT_EXECUTABLE_PATH;
export default defineConfig({
  testDir: './tests/browser',
  testMatch: ['critical-seo.playwright.spec.ts','mobile-designer-consistency.playwright.spec.ts','mobile-upload-entry.playwright.spec.ts','checkout-thumbnail-real-route.playwright.spec.ts'],
  workers: 2, timeout: 120000, expect: { timeout: 20000 }, reporter: [['line']],
  use: { baseURL: 'http://127.0.0.1:4192', screenshot:'only-on-failure',trace:'retain-on-failure' },
  webServer: { command:'node scripts/serve-seo-build.mjs', url:'http://127.0.0.1:4192', reuseExistingServer:false },
  projects: [
    {name:'chromium-1440x900',use:{browserName:'chromium',viewport:{width:1440,height:900},launchOptions:chromiumPath?{executablePath:chromiumPath}:{}}},
    {name:'chromium-pixel8-portrait',use:{...devices['Pixel 7'],browserName:'chromium',launchOptions:chromiumPath?{executablePath:chromiumPath}:{}}},
    {name:'webkit-iphone15pro-portrait',use:{...devices['iPhone 15 Pro'],browserName:'webkit',launchOptions:webkitPath?{executablePath:webkitPath}:{}}},
  ],
});
