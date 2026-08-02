import WebSocket from 'ws';

const chromeOrigin = process.env.CHROME_DEBUG_ORIGIN || 'http://127.0.0.1:9222';
const activeHarnessUrl = process.env.PREVIEW_HANDOFF_URL || 'http://127.0.0.1:4175/tests/browser/preview-handoff.html';
const commerceHarnessUrl = process.env.COMMERCE_PREVIEW_HANDOFF_URL || 'http://127.0.0.1:4175/tests/browser/commerce-preview-handoff.html';
const timeoutMs = Number(process.env.PREVIEW_HANDOFF_TIMEOUT_MS || 60_000);

const DESKTOP_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const MOBILE_USER_AGENT = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

const harnesses = [
  { name: 'active-canvas', url: activeHarnessUrl },
  { name: 'commerce-thumbnail-lightbox', url: commerceHarnessUrl },
];

const cases = [
  {
    name: 'desktop',
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
    touch: false,
    orientation: { type: 'landscapePrimary', angle: 0 },
  },
  {
    name: 'mobile-portrait',
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
    touch: true,
    orientation: { type: 'portraitPrimary', angle: 0 },
  },
  {
    name: 'mobile-landscape',
    width: 844,
    height: 390,
    deviceScaleFactor: 3,
    mobile: true,
    touch: true,
    orientation: { type: 'landscapePrimary', angle: 90 },
  },
];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForChrome() {
  const deadline = Date.now() + 15_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${chromeOrigin}/json/version`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw lastError || new Error('Chrome DevTools endpoint did not become ready.');
}

async function createPageTarget() {
  const response = await fetch(`${chromeOrigin}/json/new?${encodeURIComponent('about:blank')}`, {
    method: 'PUT',
  });
  if (!response.ok) throw new Error(`Unable to create isolated Chrome target: HTTP ${response.status}`);
  const target = await response.json();
  if (!target?.webSocketDebuggerUrl) throw new Error('Chrome did not return a page WebSocket URL.');
  return target;
}

class CdpPage {
  constructor(target, label) {
    this.target = target;
    this.label = label;
    this.socket = new WebSocket(target.webSocketDebuggerUrl);
    this.pending = new Map();
    this.nextId = 1;
    this.opened = new Promise((resolve, reject) => {
      this.socket.once('open', resolve);
      this.socket.once('error', reject);
    });
    this.socket.on('message', (data) => this.onMessage(data));
  }

  onMessage(data) {
    let message;
    try {
      message = JSON.parse(String(data));
    } catch {
      return;
    }

    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
      else resolve(message.result);
      return;
    }

    if (message.method === 'Runtime.exceptionThrown') {
      const description = message.params?.exceptionDetails?.exception?.description
        || message.params?.exceptionDetails?.text
        || 'Unknown browser exception';
      console.error(`[preview browser exception:${this.label}]`, description);
    }
  }

  async send(method, params = {}) {
    await this.opened;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }), (error) => {
        if (!error) return;
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (response?.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'Browser evaluation failed.');
    }
    return response?.result?.value;
  }

  async close() {
    try {
      await Promise.race([
        fetch(`${chromeOrigin}/json/close/${this.target.id}`),
        delay(2_000),
      ]);
    } catch {
      // Workflow cleanup terminates Chrome if the target already vanished.
    }

    for (const { reject } of this.pending.values()) {
      reject(new Error(`Chrome target ${this.label} closed during cleanup.`));
    }
    this.pending.clear();
    this.socket.close();
  }
}

async function configurePage(page, testCase) {
  await page.send('Runtime.enable');
  await page.send('Page.enable');
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await page.send('Emulation.clearDeviceMetricsOverride');

  const windowInfo = await page.send('Browser.getWindowForTarget', {
    targetId: page.target.id,
  });
  await page.send('Browser.setContentsSize', {
    windowId: windowInfo.windowId,
    width: testCase.width,
    height: testCase.height,
  });

  await page.send('Emulation.setUserAgentOverride', {
    userAgent: testCase.mobile ? MOBILE_USER_AGENT : DESKTOP_USER_AGENT,
    acceptLanguage: 'en-US,en;q=0.9',
    platform: testCase.mobile ? 'Android' : 'Linux x86_64',
  });
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: testCase.width,
    height: testCase.height,
    deviceScaleFactor: testCase.deviceScaleFactor,
    mobile: testCase.mobile,
    screenWidth: testCase.width,
    screenHeight: testCase.height,
    positionX: 0,
    positionY: 0,
    dontSetVisibleSize: false,
    screenOrientation: testCase.orientation,
  });
  await page.send('Emulation.setTouchEmulationEnabled', {
    enabled: testCase.touch,
    maxTouchPoints: testCase.touch ? 5 : 1,
  });
}

async function runHarnessCase(testCase, harness) {
  const label = `${harness.name}:${testCase.name}`;
  const target = await createPageTarget();
  const page = new CdpPage(target, label);

  try {
    await configurePage(page, testCase);

    const marker = `${harness.name}-${testCase.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const url = new URL(harness.url);
    url.searchParams.set('case', marker);
    await page.send('Page.navigate', { url: url.toString() });

    const deadline = Date.now() + timeoutMs;
    let result = 'running';
    while (Date.now() < deadline) {
      const pageState = await page.evaluate(`({
        marker: new URL(window.location.href).searchParams.get('case'),
        result: document.body?.dataset?.previewHandoffResult || 'loading'
      })`);
      if (pageState?.marker === marker) {
        result = pageState.result;
        if (result === 'pass' || result === 'fail') break;
      }
      await delay(100);
    }

    const details = await page.evaluate(`({
      ...(window.__PREVIEW_HANDOFF_RESULT__ || {
        result: document.body?.dataset?.previewHandoffResult || 'missing',
        html: document.documentElement?.outerHTML || ''
      }),
      viewport: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight,
        clientWidth: document.documentElement.clientWidth,
        clientHeight: document.documentElement.clientHeight,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        visualWidth: window.visualViewport?.width || null,
        visualHeight: window.visualViewport?.height || null,
        visualScale: window.visualViewport?.scale || null,
        devicePixelRatio: window.devicePixelRatio,
        coarsePointer: window.matchMedia('(pointer: coarse)').matches,
        touchPoints: navigator.maxTouchPoints,
        mediaMax639: window.matchMedia('(max-width: 639px)').matches,
        mediaMin640: window.matchMedia('(min-width: 640px)').matches,
        mediaMax1023: window.matchMedia('(max-width: 1023px)').matches,
        mediaMin1024: window.matchMedia('(min-width: 1024px)').matches,
        userAgent: navigator.userAgent,
        viewportMeta: document.querySelector('meta[name="viewport"]')?.content || null
      }
    })`);

    const finalResult = details?.result || result;
    const innerWidth = Number(details?.viewport?.innerWidth);
    const clientWidth = Number(details?.viewport?.clientWidth);
    const visualWidth = details?.viewport?.visualWidth == null
      ? null
      : Number(details.viewport.visualWidth);
    const reportedInnerWidthMatches = Math.abs(innerWidth - testCase.width) <= 2;
    const desktopScrollbarWidth = !testCase.mobile && reportedInnerWidthMatches
      ? Math.max(0, innerWidth - clientWidth)
      : 0;
    const visualScrollbarWidth = !testCase.mobile && reportedInnerWidthMatches && visualWidth != null
      ? Math.max(0, innerWidth - visualWidth)
      : 0;
    const hasNormalDesktopScrollbar = !testCase.mobile
      && desktopScrollbarWidth >= 0
      && desktopScrollbarWidth <= 24;
    const hasNormalDesktopVisualScrollbar = !testCase.mobile
      && visualScrollbarWidth >= 0
      && visualScrollbarWidth <= 24;
    const clientWidthMatches = Math.abs(clientWidth - testCase.width) <= 2
      || hasNormalDesktopScrollbar;
    const visualWidthMatches = visualWidth == null
      || Math.abs(visualWidth - testCase.width) <= 2
      || hasNormalDesktopVisualScrollbar;
    const pixelRatioMatches = Math.abs(Number(details?.viewport?.devicePixelRatio) - testCase.deviceScaleFactor) < 0.01;
    const pointerMatches = testCase.touch
      ? details?.viewport?.coarsePointer === true && Number(details?.viewport?.touchPoints) > 0
      : true;
    const responsiveBreakpointMatches = testCase.width < 640
      ? details?.viewport?.mediaMax639 === true && details?.viewport?.mediaMin640 === false
      : testCase.width < 1024
        ? details?.viewport?.mediaMin640 === true
          && details?.viewport?.mediaMax1023 === true
          && details?.viewport?.mediaMin1024 === false
        : details?.viewport?.mediaMin1024 === true && details?.viewport?.mediaMax1023 === false;

    // A classic desktop scrollbar legitimately subtracts roughly 15px from
    // documentElement.clientWidth/visualViewport.width while window.innerWidth,
    // screen width, and responsive breakpoints remain the requested viewport.
    // Mobile emulation stays strict because mobile scrollbars overlay content.
    const emulationPassed = reportedInnerWidthMatches
      && clientWidthMatches
      && visualWidthMatches
      && pixelRatioMatches
      && pointerMatches
      && responsiveBreakpointMatches;

    details.viewportExpectation = {
      expectedWidth: testCase.width,
      expectedHeight: testCase.height,
      expectedDevicePixelRatio: testCase.deviceScaleFactor,
      expectedTouch: testCase.touch,
      reportedInnerWidthMatches,
      clientWidthMatches,
      visualWidthMatches,
      desktopScrollbarWidth,
      visualScrollbarWidth,
      hasNormalDesktopScrollbar,
      pixelRatioMatches,
      pointerMatches,
      responsiveBreakpointMatches,
      emulationPassed,
    };

    console.log(`[preview browser result:${label}]`, JSON.stringify(details, null, 2));

    if (finalResult !== 'pass' || !emulationPassed) {
      throw new Error(`${harness.name} preview test did not pass for an isolated true ${testCase.name} CSS viewport (result: ${finalResult}, emulationPassed: ${emulationPassed}).`);
    }

    return details;
  } finally {
    await page.close();
  }
}

await waitForChrome();

const results = {};
for (const testCase of cases) {
  results[testCase.name] = {};
  for (const harness of harnesses) {
    results[testCase.name][harness.name] = await runHarnessCase(testCase, harness);
  }
}

console.log('[all isolated preview browser cases passed]', JSON.stringify(results, null, 2));
