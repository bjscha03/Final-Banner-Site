import WebSocket from 'ws';

const chromeOrigin = process.env.CHROME_DEBUG_ORIGIN || 'http://127.0.0.1:9222';
const harnessUrl = process.env.PREVIEW_HANDOFF_URL || 'http://127.0.0.1:4175/tests/browser/preview-handoff.html';
const timeoutMs = Number(process.env.PREVIEW_HANDOFF_TIMEOUT_MS || 20_000);

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
    console.error('[preview-handoff browser exception]', description);
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

try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: harnessUrl });

  const deadline = Date.now() + timeoutMs;
  let result = 'running';
  while (Date.now() < deadline) {
    result = await evaluate(`document.body?.dataset?.previewHandoffResult || 'loading'`);
    if (result === 'pass' || result === 'fail') break;
    await delay(100);
  }

  const details = await evaluate(`window.__PREVIEW_HANDOFF_RESULT__ || ({
    result: document.body?.dataset?.previewHandoffResult || 'missing',
    html: document.documentElement?.outerHTML || ''
  })`);

  console.log('[preview-handoff browser result]', JSON.stringify(details, null, 2));

  if (result !== 'pass') {
    throw new Error(`Preview handoff browser test did not pass (result: ${result}).`);
  }
} finally {
  try {
    await send('Page.close');
  } catch {
    // The workflow cleanup terminates Chrome even if the target already closed.
  }
  socket.close();
}
