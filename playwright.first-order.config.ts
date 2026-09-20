import { defineConfig } from '@playwright/test';
import previewConfig from './playwright.preview.config';
export default defineConfig({
  ...previewConfig,
  testMatch: 'automatic-first-order.playwright.spec.ts',
  projects: previewConfig.projects?.filter(project => ['chromium-1440x900', 'webkit-iphone15pro-portrait'].includes(project.name || '')),
});
