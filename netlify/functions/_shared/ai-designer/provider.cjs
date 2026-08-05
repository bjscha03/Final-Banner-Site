'use strict';

const { getImageModel, getValidationModel, getImageQuality, getTimeoutMs } = require('./config.cjs');

let cachedClient;
const accessCache = new Map();
const CONNECTION_TIMEOUT_CODES = new Set([
  'ETIMEDOUT',
  'ECONNABORTED',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
]);
const CONNECTION_FAILURE_CODES = new Set([
  'ECONNRESET',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_SOCKET',
]);

async function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error('OPENAI_API_KEY is not configured.');
    error.code = 'AI_NOT_CONFIGURED';
    throw error;
  }
  if (!cachedClient) {
    const sdk = await import('openai');
    cachedClient = {
      // The SDK retries ordinary connection and 5xx failures twice. A single
      // additional application-level retry below covers a terminal dropped
      // connection while preserving one stable idempotency key.
      client: new sdk.default({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 2 }),
      toFile: sdk.toFile,
    };
  }
  return cachedClient;
}

function providerErrorDetails(error) {
  const payload = error?.error && typeof error.error === 'object' ? error.error : {};
  const cause = error?.cause || payload?.cause;
  return {
    status: Number(error?.status || error?.response?.status || payload?.status || cause?.status || 0),
    code: String(error?.code || payload?.code || cause?.code || ''),
    type: String(error?.type || payload?.type || ''),
    message: [error?.message, payload?.message].filter(Boolean).join(' '),
    name: String(error?.name || ''),
    causeName: String(cause?.name || ''),
    providerRequestId: error?.request_id || error?.requestId || payload?.request_id || error?.headers?.['x-request-id'] || null,
  };
}

function isBillingError(error) {
  const { code, type, message } = providerErrorDetails(error);
  if (new Set([
    'billing_hard_limit_reached',
    'billing_not_active',
    'insufficient_quota',
    'usage_limit_reached',
  ]).has(code) || type === 'insufficient_quota') return true;
  return /(?:insufficient|exceeded|reached|no available).{0,40}(?:quota|credit|budget|spend(?:ing)? limit)|billing.{0,40}(?:inactive|required|limit)/i.test(message);
}

function isTransientConnectionError(error) {
  const { status, code, name, causeName } = providerErrorDetails(error);
  return name === 'APIConnectionError'
    || causeName === 'APIConnectionError'
    || CONNECTION_FAILURE_CODES.has(code)
    || status === 408
    || status === 409
    || status >= 500;
}

function safeProviderError(error, message, code) {
  const details = providerErrorDetails(error);
  const safe = new Error(message);
  safe.code = code;
  safe.providerRequestId = details.providerRequestId;
  safe.providerStatus = details.status || null;
  safe.originalName = details.name || details.causeName || null;
  safe.originalCode = details.code || null;
  return safe;
}

function classifyProviderError(error) {
  const { status, code, name, causeName } = providerErrorDetails(error);
  if (['PROVIDER_EMPTY_RESPONSE', 'PROVIDER_REQUEST_FAILED'].includes(code)) throw error;
  if (code === 'moderation_blocked' || code === 'image_generation_user_error') {
    throw safeProviderError(error, 'OpenAI could not create this request as written. Adjust the description or supplied image and try again.', 'PROVIDER_USER_ERROR');
  }
  if ([401, 403, 404].includes(status) || code === 'model_not_found') {
    throw safeProviderError(error, 'GPT Image 2 is unavailable to the configured project.', 'MODEL_ACCESS_DENIED');
  }
  if (isBillingError(error)) {
    throw safeProviderError(error, 'The configured OpenAI project has no available API budget.', 'PROVIDER_BILLING_REQUIRED');
  }
  if (status === 429) {
    throw safeProviderError(error, 'OpenAI rate limit reached.', 'PROVIDER_RATE_LIMITED');
  }
  if (
    name === 'AbortError'
    || name === 'APIUserAbortError'
    || name === 'APIConnectionTimeoutError'
    || causeName === 'AbortError'
    || CONNECTION_TIMEOUT_CODES.has(code)
  ) {
    throw safeProviderError(error, 'OpenAI image request timed out.', 'PROVIDER_TIMEOUT');
  }
  if (isTransientConnectionError(error)) {
    throw safeProviderError(error, 'The connection to OpenAI was interrupted.', 'PROVIDER_UNAVAILABLE');
  }
  if (status === 400 || status === 422) {
    throw safeProviderError(error, 'OpenAI could not create this request as written. Adjust the description or supplied image and try again.', 'PROVIDER_USER_ERROR');
  }
  throw safeProviderError(error, 'OpenAI image request failed.', 'PROVIDER_REQUEST_FAILED');
}

async function withTimeout(task, timeoutMs = getTimeoutMs()) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await task(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

function providerRequestOptions(signal, idempotencyKey) {
  return {
    signal,
    maxRetries: 2,
    ...(idempotencyKey ? {
      idempotencyKey,
      // The base OpenAI SDK currently leaves idempotencyHeader unset, so send
      // the standard header explicitly as well as the typed request option.
      headers: { 'Idempotency-Key': idempotencyKey },
    } : {}),
  };
}

async function requestWithTransientRetry(task, { idempotencyKey, timeoutMs = getTimeoutMs() } = {}) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await withTimeout(
        (signal) => task(providerRequestOptions(signal, idempotencyKey)),
        timeoutMs,
      );
    } catch (error) {
      lastError = error;
      if (attempt === 0 && isTransientConnectionError(error)) {
        await new Promise((resolve) => setTimeout(resolve, 750));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

async function verifyNamedModelAccess(model, { force = false } = {}) {
  const now = Date.now();
  const cached = accessCache.get(model);
  if (!force && cached && cached.expiresAt > now) return cached.value;
  try {
    const { client } = await getClient();
    // Readiness checks run in a synchronous Netlify function. Keep this probe
    // short; the long-running generation and edit work is handled by a
    // background function.
    const result = await withTimeout((signal) => client.models.retrieve(model, { signal }), 10000);
    const value = { available: result?.id === model || (model === getImageModel() && result?.id === 'gpt-image-2'), model, checkedAt: new Date().toISOString() };
    accessCache.set(model, { value, expiresAt: now + 5 * 60 * 1000 });
    return value;
  } catch (error) {
    try { classifyProviderError(error); } catch (safe) {
      const value = { available: false, model, checkedAt: new Date().toISOString(), error: safe.code };
      accessCache.set(model, { value, expiresAt: now + 60 * 1000 });
      return value;
    }
  }
}

async function verifyModelAccess(options = {}) {
  return verifyNamedModelAccess(getImageModel(), options);
}

async function verifyValidationModelAccess(options = {}) {
  return verifyNamedModelAccess(getValidationModel(), options);
}

function resultFromResponse(response) {
  const item = response?.data?.[0];
  if (!item?.b64_json) {
    const error = new Error('OpenAI returned no image.');
    error.code = 'PROVIDER_EMPTY_RESPONSE';
    throw error;
  }
  return {
    buffer: Buffer.from(item.b64_json, 'base64'),
    requestId: response?._request_id || response?.request_id || null,
    usage: response?.usage || null,
  };
}

async function generateImage({ prompt, size, user, idempotencyKey }) {
  const { client } = await getClient();
  const model = getImageModel();
  try {
    const response = await requestWithTransientRetry((options) => client.images.generate({
      model,
      prompt,
      n: 1,
      size,
      quality: getImageQuality(),
      output_format: 'jpeg',
      output_compression: 90,
      background: 'opaque',
      // Commercial banner briefs are frequently family- or event-oriented.
      // OpenAI's low setting still enforces policy while reducing false-positive
      // blocks for benign requests such as birthdays, schools, and sports.
      moderation: 'low',
      user,
    }, options), { idempotencyKey });
    return { ...resultFromResponse(response), model };
  } catch (error) {
    classifyProviderError(error);
  }
}

async function editImage({ prompt, size, currentImage, currentMime = 'image/jpeg', maskImage, referenceImage, user, idempotencyKey }) {
  const { client, toFile } = await getClient();
  const model = getImageModel();
  try {
    const sourceFile = await toFile(currentImage, 'current-artwork.jpg', { type: currentMime });
    const images = [sourceFile];
    if (referenceImage?.buffer) {
      images.push(await toFile(referenceImage.buffer, 'reference-image', { type: referenceImage.mimeType }));
    }
    const mask = maskImage
      ? await toFile(maskImage, 'outpaint-mask.png', { type: 'image/png' })
      : undefined;
    const response = await requestWithTransientRetry((options) => client.images.edit({
      model,
      image: images,
      ...(mask ? { mask } : {}),
      prompt,
      n: 1,
      size,
      quality: getImageQuality(),
      // GPT Image 2 always processes image inputs at high fidelity and rejects
      // an explicit input_fidelity override.
      output_format: 'jpeg',
      output_compression: 90,
      background: 'opaque',
      moderation: 'low',
      user,
    }, options), { idempotencyKey });
    return { ...resultFromResponse(response), model };
  } catch (error) {
    classifyProviderError(error);
  }
}

function creativeBriefSchema() {
  const properties = Object.fromEntries([
    'purpose', 'targetAudience', 'primaryMessage', 'visualStyle', 'brandPersonality',
    'colorPalette', 'subjectMatter', 'composition', 'focalPoint', 'viewingDistance',
  ].map((key) => [key, { type: 'string' }]));
  return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties };
}

async function structureCreativeBrief({ description, current, dimensions, usage, user, idempotencyKey }) {
  const { client } = await getClient();
  try {
    const response = await requestWithTransientRetry((options) => client.responses.create({
      model: getValidationModel(),
      input: [{
        role: 'user',
        content: [{
          type: 'input_text',
          text: [
            'Convert this banner request into a concise commercial-print creative brief.',
            'Do not invent customer wording, contact details, offers, dates, prices, or brand claims.',
            'Do not repeat exact required copy in these fields; exact copy is maintained separately.',
            'Favor a flat edge-to-edge composition, large-format legibility, a clean deterministic typography zone, and safe internal margins.',
            `Physical dimensions: ${dimensions}. Usage: ${usage}.`,
            `Existing user selections to respect when useful: ${JSON.stringify(current)}.`,
            `Customer request to interpret: ${JSON.stringify(description)}.`,
          ].join('\n'),
        }],
      }],
      text: {
        format: {
          type: 'json_schema',
          name: 'commercial_print_creative_brief',
          strict: true,
          schema: creativeBriefSchema(),
        },
      },
      max_output_tokens: 900,
      safety_identifier: user,
    }, options), { idempotencyKey });
    const raw = response.output_text || response.output?.flatMap((item) => item.content || []).find((item) => item.type === 'output_text')?.text;
    return { brief: JSON.parse(raw || ''), requestId: response?._request_id || null, model: getValidationModel() };
  } catch (error) {
    classifyProviderError(error);
  }
}

module.exports = {
  getClient,
  classifyProviderError,
  isTransientConnectionError,
  requestWithTransientRetry,
  verifyModelAccess,
  verifyValidationModelAccess,
  generateImage,
  editImage,
  structureCreativeBrief,
  getValidationModel,
  withTimeout,
};
