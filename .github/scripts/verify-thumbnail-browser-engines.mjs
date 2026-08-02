import fs from 'node:fs/promises';
import path from 'node:path';
import {
  chromium,
  firefox,
  webkit,
} from 'playwright';

const engineName = String(process.env.PLAYWRIGHT_BROWSER || '').trim().toLowerCase();
const baseUrl = String(process.env.PREVIEW_HARNESS_BASE_URL || 'http://127.0.0.1:4175').replace(/\/$/, '');
const browserTypes = { chromium, firefox, webkit };
const browserType = browserTypes[engineName];

if (!browserType) {
  throw new Error(`Unsupported PLAYWRIGHT_BROWSER: ${engineName || '(empty)'}`);
}

const harnesses = [
  {
    name: 'active-canvas',
    path: '/tests/browser/preview-handoff.html',
  },
  {
    name: 'commerce-thumbnail-lightbox',
    path: '/tests/browser/commerce-preview-handoff.html',
  },
];

const viewports = [
  {
    name: 'desktop',
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
    hasTouch: false,
  },
  {
    name: 'mobile-portrait',
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
    hasTouch: true,
  },
  {
    name: 'mobile-landscape',
    width: 844,
    height: 390,
    deviceScaleFactor: 3,
    mobile: true,
    hasTouch: true,
  },
];

const mobileUserAgents = {
  chromium: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  firefox: 'Mozilla/5.0 (Android 14; Mobile; rv:142.0) Gecko/142.0 Firefox/142.0',
  webkit: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
};

const resultsDir = path.resolve('test-results', 'preview-browser-engines');
await fs.mkdir(resultsDir, { recursive: true });

const browser = await browserType.launch({ headless: true });
const results = [];
let failed = false;

try {
  for (const viewport of viewports) {
    for (const harness of harnesses) {
      const label = `${engineName}:${viewport.name}:${harness.name}`;
      const contextOptions = {
        viewport: { width: viewport.width, height: viewport.height },
        screen: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor,
        hasTouch: viewport.hasTouch,
        locale: 'en-US',
        colorScheme: 'light',
        reducedMotion: 'no-preference',
        serviceWorkers: 'block',
      };

      if (viewport.mobile) {
        contextOptions.userAgent = mobileUserAgents[engineName];
        // Playwright's Firefox implementation does not support the isMobile
        // context flag, but viewport + screen + mobile UA still drive the CSS
        // layout and responsive code paths used by this harness.
        if (engineName !== 'firefox') contextOptions.isMobile = true;
      }

      const context = await browser.newContext(contextOptions);
      const page = await context.newPage();
      const consoleMessages = [];
      const pageErrors = [];
      page.on('console', (message) => {
        const entry = `[${message.type()}] ${message.text()}`;
        consoleMessages.push(entry);
        if (message.type() === 'error') console.error(`[browser console:${label}] ${entry}`);
      });
      page.on('pageerror', (error) => {
        const entry = error instanceof Error ? error.stack || error.message : String(error);
        pageErrors.push(entry);
        console.error(`[browser exception:${label}] ${entry}`);
      });

      const marker = `${engineName}-${viewport.name}-${harness.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const url = new URL(`${baseUrl}${harness.path}`);
      url.searchParams.set('case', marker);

      let result;
      let geometry;
      let failureReason = null;
      try {
        await page.goto(url.toString(), {
          waitUntil: 'domcontentloaded',
          timeout: 45_000,
        });
        await page.waitForFunction(
          () => ['pass', 'fail'].includes(document.body?.dataset?.previewHandoffResult || ''),
          null,
          { timeout: 90_000 },
        );

        result = await page.evaluate(() => (
          window.__PREVIEW_HANDOFF_RESULT__ || {
            result: document.body?.dataset?.previewHandoffResult || 'missing',
          }
        ));
        geometry = await page.evaluate(() => ({
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          clientWidth: document.documentElement.clientWidth,
          clientHeight: document.documentElement.clientHeight,
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          visualWidth: window.visualViewport?.width || null,
          visualHeight: window.visualViewport?.height || null,
          devicePixelRatio: window.devicePixelRatio,
          touchPoints: navigator.maxTouchPoints,
          coarsePointer: window.matchMedia('(pointer: coarse)').matches,
          mediaMax639: window.matchMedia('(max-width: 639px)').matches,
          mediaMin640: window.matchMedia('(min-width: 640px)').matches,
          mediaMax1023: window.matchMedia('(max-width: 1023px)').matches,
          mediaMin1024: window.matchMedia('(min-width: 1024px)').matches,
          viewportMeta: document.querySelector('meta[name="viewport"]')?.content || null,
        }));

        // Horizontal containment is a commerce thumbnail/lightbox contract.
        // The active design harness intentionally moves artwork beyond its
        // clipping canvas to test drag transforms, so whole-document scroll
        // width is not a meaningful pass/fail signal for that separate harness.
        const horizontalOverflow = harness.name === 'commerce-thumbnail-lightbox'
          && geometry.scrollWidth > geometry.clientWidth + 1;
        const responsiveMatches = viewport.width < 640
          ? geometry.mediaMax639 === true && geometry.mediaMin640 === false
          : viewport.width < 1024
            ? geometry.mediaMin640 === true
              && geometry.mediaMax1023 === true
              && geometry.mediaMin1024 === false
            : geometry.mediaMin1024 === true && geometry.mediaMax1023 === false;
        // Chromium exposes Playwright touch emulation through maxTouchPoints.
        // Firefox and WebKit on Linux can honor the requested mobile viewport,
        // DPR, UA, and responsive layout while still reporting zero touch
        // points, so do not convert that runner limitation into a false failure.
        const touchMatches = !viewport.hasTouch
          || engineName !== 'chromium'
          || geometry.touchPoints > 0;
        const dprMatches = Math.abs(geometry.devicePixelRatio - viewport.deviceScaleFactor) < 0.01;

        if (result?.result !== 'pass') {
          failureReason = `Harness reported ${result?.result || 'missing'}: ${result?.reason || result?.stage || 'unknown reason'}`;
        } else if (horizontalOverflow) {
          failureReason = `Horizontal overflow detected (${geometry.scrollWidth}px > ${geometry.clientWidth}px)`;
        } else if (!responsiveMatches) {
          failureReason = 'Responsive breakpoint did not match the requested CSS viewport.';
        } else if (!touchMatches) {
          failureReason = 'Chromium touch-capable context was not active.';
        } else if (!dprMatches) {
          failureReason = `DPR mismatch: ${geometry.devicePixelRatio} !== ${viewport.deviceScaleFactor}`;
        } else if (pageErrors.length > 0) {
          failureReason = `Browser page exception: ${pageErrors[0]}`;
        }
      } catch (error) {
        failureReason = error instanceof Error ? error.stack || error.message : String(error);
        result = result || { result: 'exception' };
        geometry = geometry || null;
      }

      const record = {
        engine: engineName,
        viewport: viewport.name,
        harness: harness.name,
        requestedViewport: viewport,
        result,
        geometry,
        pageErrors,
        consoleErrors: consoleMessages.filter((message) => message.startsWith('[error]')),
        passed: !failureReason,
        failureReason,
      };
      results.push(record);

      if (failureReason) {
        failed = true;
        const screenshotPath = path.join(resultsDir, `${engineName}-${viewport.name}-${harness.name}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
        console.error(`[preview-engine-failure:${label}] ${failureReason}`);
      } else {
        console.log(`[preview-engine-pass:${label}]`, JSON.stringify({
          result: result?.result,
          stage: result?.stage || null,
          geometry,
        }));
      }

      await context.close();
    }
  }
} finally {
  await browser.close();
}

const reportPath = path.join(resultsDir, `${engineName}-results.json`);
await fs.writeFile(reportPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8');

const passedCount = results.filter((result) => result.passed).length;
console.log(`[preview-engine-summary:${engineName}] ${passedCount}/${results.length} cases passed.`);

if (failed || passedCount !== results.length) {
  process.exitCode = 1;
}
