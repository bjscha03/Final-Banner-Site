import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
 testDir:'./tests/browser',testMatch:['yard-sign-sizes.playwright.spec.ts'],fullyParallel:true,workers:2,retries:0,
 timeout:120000,expect:{timeout:20000},reporter:[['line']],
 use:{baseURL:'http://127.0.0.1:4175',screenshot:'only-on-failure',trace:'retain-on-failure'},
 webServer:{command:'npx vite --config tests/browser/vite.handoff.config.ts',url:'http://127.0.0.1:4175/tests/browser/preview-handoff.html',env:{VITE_AI_BANNER_ENABLED:'true'},timeout:120000},
 projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['Pixel 8'],browserName:'chromium'}}],
});
