import { defineConfig } from "@playwright/test";
import previewConfig from "./playwright.preview.config";
export default defineConfig({
  ...previewConfig,
  testMatch: "bof-referrals.playwright.spec.ts",
  projects: previewConfig.projects?.filter((p) =>
    [
      "chromium-1440x900",
      "chromium-pixel8-portrait",
      "webkit-iphone15pro-portrait",
    ].includes(p.name || ""),
  ),
});
