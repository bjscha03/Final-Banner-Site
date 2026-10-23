import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, firefox, webkit } from 'playwright';

const engineName = String(process.env.PLAYWRIGHT_BROWSER || '').trim().toLowerCase();
const baseUrl = String(process.env.PREVIEW_HARNESS_BASE_URL || 'http://127.0.0.1:4175').replace(/\/$/, '');
const browserType = { chromium, firefox, webkit }[engineName];
if (!browserType) throw new Error(`Unsupported browser engine: ${engineName || '(empty)'}`);

const harnesses = [
  ['active-canvas', '/tests/browser/preview-handoff.html'],
  ['commerce-thumbnail-lightbox', '/tests/browser/commerce-preview-handoff.html'],
  ['order-confirmation-my-orders-admin', '/tests/browser/order-surface-preview.html'],
];

const viewports = [
  ['desktop', 1280, 900, 1, false],
  ['phone-portrait', 390, 844, 3, true],
  ['phone-landscape', 844, 390, 3, true],
];

const mobileUserAgents = {
  chromium: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  firefox: 'Mozilla/5.0 (Android 14; Mobile; rv:142.0) Gecko/142.0 Firefox/142.0',
  webkit: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
};

const resultsDirectory = path.resolve('test-results', 'final-sitewide-preview-engines');
await fs.mkdir(resultsDirectory, { recursive: true });
const browser = await browserType.launch({ headless: true });
const results = [];
let failed = false;

try {
  for (const [viewportName, width, height, dpr, mobile] of viewports) {
    for (const [harnessName, harnessPath] of harnesses) {
      const contextOptions = {
        viewport: { width, height },
        screen: { width, height },
        deviceScaleFactor: dpr,
        hasTouch: mobile,
        locale: 'en-US',
        colorScheme: 'light',
        reducedMotion: 'no-preference',
        serviceWorkers: 'block',
      };
      if (mobile) {
        contextOptions.userAgent = mobileUserAgents[engineName];
        if (engineName !== 'firefox') contextOptions.isMobile = true;
      }

      const context = await browser.newContext(contextOptions);
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.stack || error.message || String(error)));

      const label = `${engineName}:${viewportName}:${harnessName}`;
      const url = new URL(`${baseUrl}${harnessPath}`);
      url.searchParams.set('case', `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`);

      let result = null;
      let diagnostics = null;
      let failureReason = null;
      try {
        await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 45_000 });
        await page.waitForFunction(
          () => ['pass', 'fail'].includes(document.body?.dataset?.previewHandoffResult || ''),
          null,
          { timeout: 100_000 },
        );
        result = await page.evaluate(() => window.__PREVIEW_HANDOFF_RESULT__ || {
          result: document.body?.dataset?.previewHandoffResult || 'missing',
        });
        diagnostics = await page.evaluate(() => ({
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          clientWidth: document.documentElement.clientWidth,
          clientHeight: document.documentElement.clientHeight,
          scrollWidth: document.documentElement.scrollWidth,
          visualWidth: window.visualViewport?.width || null,
          visualHeight: window.visualViewport?.height || null,
          devicePixelRatio: window.devicePixelRatio,
          maxTouchPoints: navigator.maxTouchPoints,
          coarsePointer: window.matchMedia('(pointer: coarse)').matches,
          max639: window.matchMedia('(max-width: 639px)').matches,
          min640: window.matchMedia('(min-width: 640px)').matches,
          max1023: window.matchMedia('(max-width: 1023px)').matches,
          min1024: window.matchMedia('(min-width: 1024px)').matches,
          viewportMeta: document.querySelector('meta[name="viewport"]')?.content || null,
        }));

        const breakpointPassed = width < 640
          ? diagnostics.max639 && !diagnostics.min640
          : width < 1024
            ? diagnostics.min640 && diagnostics.max1023 && !diagnostics.min1024
            : diagnostics.min1024 && !diagnostics.max1023;
        const dprPassed = Math.abs(diagnostics.devicePixelRatio - dpr) < 0.01;
        const commerceOverflow = harnessName !== 'active-canvas'
          && diagnostics.scrollWidth > diagnostics.clientWidth + 1;
        const chromiumTouchPassed = !mobile || engineName !== 'chromium' || diagnostics.maxTouchPoints > 0;

        if (result?.result !== 'pass') {
          failureReason = `Harness reported ${result?.result || 'missing'}: ${result?.reason || result?.stage || 'unknown reason'}`;
        } else if (!breakpointPassed) {
          failureReason = 'Responsive breakpoint mismatch.';
        } else if (!dprPassed) {
          failureReason = `DPR mismatch: ${diagnostics.devicePixelRatio} instead of ${dpr}.`;
        } else if (commerceOverflow) {
          failureReason = `Horizontal overflow: ${diagnostics.scrollWidth} > ${diagnostics.clientWidth}.`;
        } else if (!chromiumTouchPassed) {
          failureReason = 'Chromium touch emulation was inactive.';
        } else if (pageErrors.length) {
          failureReason = `Browser exception: ${pageErrors[0]}`;
        }
      } catch (error) {
        failureReason = error.stack || error.message || String(error);
      }

      const record = {
        engine: engineName,
        viewport: viewportName,
        harness: harnessName,
        requested: { width, height, dpr, mobile },
        passed: !failureReason,
        failureReason,
        result,
        diagnostics,
        pageErrors,
      };
      results.push(record);

      if (failureReason) {
        failed = true;
        console.error(`[final-preview-failure:${label}] ${failureReason}`);
        await page.screenshot({
          path: path.join(resultsDirectory, `${engineName}-${viewportName}-${harnessName}.png`),
          fullPage: true,
        }).catch(() => undefined);
      } else {
        console.log(`[final-preview-pass:${label}] ${JSON.stringify({ stage: result?.stage || null, diagnostics })}`);
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}

await fs.writeFile(
  path.join(resultsDirectory, `${engineName}-results.json`),
  `${JSON.stringify(results, null, 2)}\n`,
  'utf8',
);

const passed = results.filter((entry) => entry.passed).length;
console.log(`[final-preview-summary:${engineName}] ${passed}/${results.length} cases passed.`);
if (failed || passed !== results.length) process.exitCode = 1;
