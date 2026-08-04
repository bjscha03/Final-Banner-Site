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

async function assertCompletedHarness(page: Page, route: string): Promise<HarnessResult> {
  const details = await readHarnessResult(page);
  expect(details.result, `${route}: ${details.reason || 'harness failed'}`).toBe('pass');
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(
    overflow.scrollWidth,
    `${route} created horizontal overflow: ${JSON.stringify(overflow)}`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
  return details;
}

async function assertHarness(
  page: Page,
  route: string,
  navigationTimeoutMs = 30_000,
): Promise<HarnessResult> {
  const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await page.goto(`${route}?playwright=${marker}`, {
    waitUntil: 'domcontentloaded',
    timeout: navigationTimeoutMs,
  });
  return assertCompletedHarness(page, route);
}

async function prepareDeferredHarness(page: Page, route: string): Promise<void> {
  const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await page.goto(`${route}?playwright=${marker}&deferStart=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.waitForFunction(
    () => document.body?.dataset?.previewHandoffReady === 'true',
    undefined,
    { timeout: 30_000 },
  );
}

async function startDeferredHarness(page: Page, route: string): Promise<HarnessResult> {
  await page.evaluate(() => {
    const start = (window as Window & { __START_PREVIEW_HANDOFF__?: () => void })
      .__START_PREVIEW_HANDOFF__;
    if (!start) throw new Error('deferred preview handoff start hook is missing');
    start();
  });
  return assertCompletedHarness(page, route);
}

test('preview password input is safe from iOS focus zoom', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'webkit-iphone15pro-portrait',
    'One iOS WebKit run is sufficient',
  );

  await page.goto('http://127.0.0.1:4176/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Preview Access' })).toBeVisible();

  const passwordInput = page.locator('input[type="password"]');
  await expect(passwordInput).toBeVisible();

  const fontSize = await passwordInput.evaluate((input) =>
    Number.parseFloat(getComputedStyle(input).fontSize),
  );

  expect(fontSize).toBeGreaterThanOrEqual(16);
});

test('design selector keeps banner, yard-sign, and magnet mockups fully inside their frames', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-1440x900', 'One desktop selector run is sufficient');

  await page.goto('/design?product=banner', { waitUntil: 'domcontentloaded' });
  for (const width of [768, 820, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

    const selectorStages = page.locator('[role="tab"] [data-selector-product-stage]');
    await expect(selectorStages).toHaveCount(3);

    const diagramSubjects = page.locator('[role="tab"] [data-selector-product-subject]');
    await expect(diagramSubjects).toHaveCount(2);
    const diagramMargins = await diagramSubjects.evaluateAll((subjects) => subjects.map((subject) => {
      const frame = subject.closest<HTMLElement>('[data-selector-product-stage]');
      if (!frame) throw new Error('Selector product stage is missing.');
      const subjectRect = subject.getBoundingClientRect();
      const frameRect = frame.getBoundingClientRect();
      return {
        left: (subjectRect.left - frameRect.left) / frameRect.width,
        right: (frameRect.right - subjectRect.right) / frameRect.width,
        top: (subjectRect.top - frameRect.top) / frameRect.height,
        bottom: (frameRect.bottom - subjectRect.bottom) / frameRect.height,
      };
    }));
    for (const margins of diagramMargins) {
      expect(Math.min(margins.left, margins.right, margins.top, margins.bottom), `diagram safety margin at ${width}px`).toBeGreaterThanOrEqual(0.03);
    }

    const faceStates = await page.locator('[role="tab"] [data-selector-product-face]').evaluateAll((faces) => faces.map((face) => {
      const element = face as HTMLElement;
      const stage = element.closest<HTMLElement>('[data-selector-product-stage]');
      if (!stage) throw new Error('Selector face is missing its stage.');
      const faceRect = element.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      const labels = Array.from(element.querySelectorAll<HTMLElement>('p')).map((label) => {
        const range = document.createRange();
        range.selectNodeContents(label);
        const textRect = range.getBoundingClientRect();
        const labelRect = label.getBoundingClientRect();
        return {
          horizontalOverflow: label.scrollWidth - label.clientWidth,
          verticalOverflow: label.scrollHeight - label.clientHeight,
          textInsideFace:
            textRect.left >= faceRect.left - 1
            && textRect.right <= faceRect.right + 1
            && textRect.top >= faceRect.top - 1
            && textRect.bottom <= faceRect.bottom + 1,
          labelInsideFace:
            labelRect.left >= faceRect.left - 1
            && labelRect.right <= faceRect.right + 1
            && labelRect.top >= faceRect.top - 1
            && labelRect.bottom <= faceRect.bottom + 1,
        };
      });
      return {
        faceInsideStage:
          faceRect.left >= stageRect.left - 1
          && faceRect.right <= stageRect.right + 1
          && faceRect.top >= stageRect.top - 1
          && faceRect.bottom <= stageRect.bottom + 1,
        horizontalOverflow: element.scrollWidth - element.clientWidth,
        verticalOverflow: element.scrollHeight - element.clientHeight,
        labels,
      };
    }));
    expect(faceStates).toHaveLength(2);
    for (const state of faceStates) {
      expect(state.faceInsideStage, `face containment at ${width}px`).toBe(true);
      expect(state.horizontalOverflow, `face horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
      expect(state.verticalOverflow, `face vertical overflow at ${width}px`).toBeLessThanOrEqual(1);
      expect(state.labels).toHaveLength(2);
      for (const label of state.labels) {
        expect(label.horizontalOverflow, `label horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
        // Chromium can round a tightly set single-line font's scrollHeight up
        // by two device pixels even when both the label box and glyph range
        // are fully contained. The range/face assertions below are the visual
        // clipping authority; this remains a guard against material overflow.
        expect(label.verticalOverflow, `label vertical overflow at ${width}px`).toBeLessThanOrEqual(2);
        expect(label.textInsideFace, `text containment at ${width}px`).toBe(true);
        expect(label.labelInsideFace, `label containment at ${width}px`).toBe(true);
      }
    }

    const productImages = page.locator('[role="tab"] [data-product-visual-image]');
    await expect(productImages).toHaveCount(1);
    await page.waitForFunction(() => {
      const images = Array.from(document.querySelectorAll<HTMLImageElement>('[role="tab"] [data-product-visual-image]'));
      return images.length === 1 && images.every((image) => image.complete && image.naturalWidth > 0);
    });

    const imageState = await productImages.first().evaluate((element) => {
      const image = element as HTMLImageElement;
      const stage = image.closest<HTMLElement>('[data-selector-product-stage]');
      if (!stage) throw new Error('Magnet image is missing its stage.');
      const rect = image.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      const naturalRatio = image.naturalWidth / image.naturalHeight;
      const renderedWidth = Math.min(rect.width, rect.height * naturalRatio);
      const renderedHeight = renderedWidth / naturalRatio;
      const renderedRect = {
        left: rect.left + (rect.width - renderedWidth) / 2,
        right: rect.left + (rect.width + renderedWidth) / 2,
        top: rect.top + (rect.height - renderedHeight) / 2,
        bottom: rect.top + (rect.height + renderedHeight) / 2,
      };
      return {
        objectFit: getComputedStyle(image).objectFit,
        renderedInsideStage:
          renderedRect.left >= stageRect.left - 1
          && renderedRect.right <= stageRect.right + 1
          && renderedRect.top >= stageRect.top - 1
          && renderedRect.bottom <= stageRect.bottom + 1,
      };
    });
    expect(imageState.objectFit).toBe('contain');
    expect(imageState.renderedInsideStage, `magnet containment at ${width}px`).toBe(true);
  }
});

test('preview identity remains stable across compact and expanded surfaces', async ({
  browser,
  page,
}, testInfo) => {
  await assertHarness(page, harnessRoutes[0]);
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

  for (const route of harnessRoutes.slice(1)) await assertHarness(page, route);
});

test('Chromium survives handoffs during slow 3G and 4x CPU throttling', async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-1440x900', 'Chromium-only CDP throttle coverage');
  test.setTimeout(300_000);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');

  const setThrottle = async (enabled: boolean) => {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: enabled ? 400 : 0,
      downloadThroughput: enabled ? 50 * 1024 : -1,
      uploadThroughput: enabled ? 50 * 1024 : -1,
      connectionType: enabled ? 'cellular3g' : 'none',
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: enabled ? 4 : 1 });
  };

  try {
    for (const route of harnessRoutes.slice(0, 2)) {
      await setThrottle(false);
      await prepareDeferredHarness(page, route);
      await setThrottle(true);
      await startDeferredHarness(page, route);
    }
  } finally {
    await setThrottle(false);
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
