import WebSocket from 'ws';

const chromeOrigin = process.env.CHROME_DEBUG_ORIGIN || 'http://127.0.0.1:9222';
const activeHarnessUrl = process.env.PREVIEW_HANDOFF_URL || 'http://127.0.0.1:4175/tests/browser/preview-handoff.html';
const commerceHarnessUrl = process.env.COMMERCE_PREVIEW_HANDOFF_URL || 'http://127.0.0.1:4175/tests/browser/commerce-preview-handoff.html';
const timeoutMs = Number(process.env.PREVIEW_HANDOFF_TIMEOUT_MS || 20_000);

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

async function getPageTarget() {
  const response = await fetch(`${chromeOrigin}/json/list`);
  if (!response.ok) throw new Error(`Unable to list Chrome targets: HTTP ${response.status}`);
  const targets = await response.json();
  const target = targets.find((candidate) => candidate.type === 'page' && candidate.webSocketDebuggerUrl);
  if (!target) throw new Error('Chrome did not expose a page target.');
  return target;
}

await waitForChrome();
const target = await getPageTarget();
const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 1;

const opened = new Promise((resolve, reject) => {
  socket.once('open', resolve);
  socket.once('error', reject);
});

socket.on('message', (data) => {
  let message;
  try {
    message = JSON.parse(String(data));
  } catch {
    return;
  }

  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
    else resolve(message.result);
    return;
  }

  if (message.method === 'Runtime.exceptionThrown') {
    const description = message.params?.exceptionDetails?.exception?.description
      || message.params?.exceptionDetails?.text
      || 'Unknown browser exception';
    console.error('[preview browser exception]', description);
  }
});

await opened;

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }), (error) => {
      if (!error) return;
      pending.delete(id);
      reject(error);
    });
  });
}

async function evaluate(expression) {
  const response = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (response?.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'Browser evaluation failed.');
  }
  return response?.result?.value;
}

async function applyViewport(testCase) {
  await send('Emulation.setUserAgentOverride', {
    userAgent: testCase.mobile ? MOBILE_USER_AGENT : DESKTOP_USER_AGENT,
    acceptLanguage: 'en-US,en;q=0.9',
    platform: testCase.mobile ? 'Android' : 'Linux x86_64',
  });

  await send('Emulation.setDeviceMetricsOverride', {
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
    viewport: {
      x: 0,
      y: 0,
      width: testCase.width,
      height: testCase.height,
      scale: 1,
    },
  });

  await send('Emulation.setTouchEmulationEnabled', {
    enabled: testCase.touch,
    maxTouchPoints: testCase.touch ? 5 : 1,
  });
}

async function runHarnessCase(testCase, harness) {
  await applyViewport(testCase);

  const marker = `${harness.name}-${testCase.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const url = new URL(harness.url);
  url.searchParams.set('case', marker);
  await send('Page.navigate', { url: url.toString() });

  const deadline = Date.now() + timeoutMs;
  let result = 'running';
  while (Date.now() < deadline) {
    const pageState = await evaluate(`({
      href: window.location.href,
      result: document.body?.dataset?.previewHandoffResult || 'loading'
    })`);
    if (pageState?.href?.includes(marker)) {
      result = pageState.result;
      if (result === 'pass' || result === 'fail') break;
    }
    await delay(100);
  }

  const details = await evaluate(`({
    ...(window.__PREVIEW_HANDOFF_RESULT__ || {
      result: document.body?.dataset?.previewHandoffResult || 'missing',
      html: document.documentElement?.outerHTML || ''
    }),
    viewport: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      visualWidth: window.visualViewport?.width || null,
      visualHeight: window.visualViewport?.height || null,
      devicePixelRatio: window.devicePixelRatio,
      coarsePointer: window.matchMedia('(pointer: coarse)').matches,
      touchPoints: navigator.maxTouchPoints,
      userAgent: navigator.userAgent
    }
  })`);

  const viewportWidthMatches = Math.abs(Number(details?.viewport?.innerWidth) - testCase.width) <= 2;
  const visualWidthMatches = details?.viewport?.visualWidth == null
    || Math.abs(Number(details.viewport.visualWidth) - testCase.width) <= 2;
  const pixelRatioMatches = Math.abs(Number(details?.viewport?.devicePixelRatio) - testCase.deviceScaleFactor) < 0.01;
  const pointerMatches = testCase.touch
    ? details?.viewport?.coarsePointer === true && Number(details?.viewport?.touchPoints) > 0
    : true;
  const emulationPassed = viewportWidthMatches && visualWidthMatches && pixelRatioMatches && pointerMatches;

  details.viewportExpectation = {
    expectedWidth: testCase.width,
    expectedHeight: testCase.height,
    expectedDevicePixelRatio: testCase.deviceScaleFactor,
    expectedTouch: testCase.touch,
    viewportWidthMatches,
    visualWidthMatches,
    pixelRatioMatches,
    pointerMatches,
    emulationPassed,
  };

  console.log(`[preview browser result:${harness.name}:${testCase.name}]`, JSON.stringify(details, null, 2));

  if (result !== 'pass' || !emulationPassed) {
    throw new Error(`${harness.name} preview test did not pass for a true ${testCase.name} viewport (result: ${result}, emulationPassed: ${emulationPassed}).`);
  }

  return details;
}

try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });

  const results = {};
  for (const testCase of cases) {
    results[testCase.name] = {};
    for (const harness of harnesses) {
      results[testCase.name][harness.name] = await runHarnessCase(testCase, harness);
    }
  }

  console.log('[all preview browser cases passed]', JSON.stringify(results, null, 2));
} finally {
  try {
    await send('Page.close');
  } catch {
    // The workflow cleanup terminates Chrome even if the target already closed.
  }
  socket.close();
}
