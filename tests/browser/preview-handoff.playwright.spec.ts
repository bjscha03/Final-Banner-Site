import { expect, test, type Page } from '@playwright/test';

const harnessRoutes = [
  '/tests/browser/preview-handoff.html',
  '/tests/browser/commerce-preview-handoff.html',
  '/tests/browser/order-surface-preview.html',
];

type HarnessResult = {
  result?: string;
  reason?: string;
  viewport?: Record<string, unknown>;
};

async function readHarnessResult(page: Page): Promise<HarnessResult> {
  await page.waitForFunction(() => {
    const result = document.body?.dataset?.previewHandoffResult;
    return result === 'pass' || result === 'fail';
  }, undefined, { timeout: 90_000 });

  return page.evaluate(() => ({
    ...(window as Window & { __PREVIEW_HANDOFF_RESULT__?: HarnessResult })
      .__PREVIEW_HANDOFF_RESULT__,
    result: document.body?.dataset?.previewHandoffResult || 'missing',
  }));
}

async function assertHarness(page: Page, route: string): Promise<HarnessResult> {
  const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await page.goto(`${route}?playwright=${marker}`, { waitUntil: 'domcontentloaded' });
  const details = await readHarnessResult(page);
  expect(details.result, `${route}: ${details.reason || 'harness failed'}`).toBe('pass');
  expect(await page.evaluate(() => (
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
  )), `${route} created horizontal overflow`).toBe(true);
  return details;
}

test('preview identity remains stable across compact and expanded surfaces', async ({
  browser,
  page,
}, testInfo) => {
  const runtime = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    devicePixelRatio: window.devicePixelRatio,
    touchPoints: navigator.maxTouchPoints,
  }));
  console.log('[playwright-browser]', JSON.stringify({
    project: testInfo.project.name,
    browserVersion: browser.version(),
    ...runtime,
  }));

  for (const route of harnessRoutes) await assertHarness(page, route);
});

test('Chromium survives slow 3G and 4x CPU throttling', async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-1440x900', 'Chromium-only CDP throttle coverage');
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 400,
    downloadThroughput: 50 * 1024,
    uploadThroughput: 50 * 1024,
    connectionType: 'cellular3g',
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  try {
    await assertHarness(page, '/tests/browser/preview-handoff.html');
    await assertHarness(page, '/tests/browser/commerce-preview-handoff.html');
  } finally {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
      connectionType: 'none',
    });
    await cdp.detach();
  }
});

test('Chromium preserves previews through backgrounding, resize, and history', async ({
  context,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-1440x900', 'One lifecycle run is sufficient');

  await assertHarness(page, '/tests/browser/preview-handoff.html');
  const background = await context.newPage();
  await background.goto('about:blank');
  await background.bringToFront();
  await page.waitForTimeout(300);
  await page.bringToFront();
  expect((await readHarnessResult(page)).result).toBe('pass');
  await background.close();

  await assertHarness(page, '/tests/browser/commerce-preview-handoff.html');
  await page.goBack({ waitUntil: 'domcontentloaded' });
  expect((await readHarnessResult(page)).result).toBe('pass');
  await page.goForward({ waitUntil: 'domcontentloaded' });
  expect((await readHarnessResult(page)).result).toBe('pass');

  await page.setViewportSize({ width: 900, height: 1200 });
  await assertHarness(page, '/tests/browser/commerce-preview-handoff.html');
});
