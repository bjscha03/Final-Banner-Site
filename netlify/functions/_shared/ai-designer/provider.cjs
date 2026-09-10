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
      // Retry once at the application boundary, within one total deadline.
      client: new sdk.default({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 }),
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
    throw safeProviderError(error, 'The configured GPT Image model is unavailable to this project.', 'MODEL_ACCESS_DENIED');
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
    maxRetries: 0,
    ...(idempotencyKey ? {
      idempotencyKey,
      // The base OpenAI SDK currently leaves idempotencyHeader unset, so send
      // the standard header explicitly as well as the typed request option.
      headers: { 'Idempotency-Key': idempotencyKey },
    } : {}),
  };
}

async function requestWithTransientRetry(task, { idempotencyKey, timeoutMs = getTimeoutMs() } = {}) {
  const startedAt = Date.now();
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await withTimeout(
        (signal) => task(providerRequestOptions(signal, idempotencyKey)),
        Math.max(1, timeoutMs - (Date.now() - startedAt)),
      );
    } catch (error) {
      lastError = error;
      if (attempt === 0 && Date.now() - startedAt < Math.min(10000, timeoutMs / 2) && isTransientConnectionError(error)) {
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

async function editImage({ prompt, size, currentImage, currentMime = 'image/jpeg', maskImage, referenceImage, logoReferenceImage, user, idempotencyKey }) {
  const { client, toFile } = await getClient();
  const model = getImageModel();
  try {
    const sourceFile = await toFile(currentImage, 'current-artwork.jpg', { type: currentMime });
    const images = [sourceFile];
    if (referenceImage?.buffer) {
      images.push(await toFile(referenceImage.buffer, 'reference-image', { type: referenceImage.mimeType }));
    }
    if (logoReferenceImage?.buffer) {
      images.push(await toFile(logoReferenceImage.buffer, 'customer-logo-brand-reference.png', { type: logoReferenceImage.mimeType }));
      prompt += '\nThe final supplied image is the customer logo: use it only for brand identity and colors, never as artwork to copy or redraw. Its exact original is added afterward in the reserved footprint. The first image remains the composition to edit unless this request explicitly calls for a NEW banner composition.';
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
      // Preserve the complete source image as the first input. An explicit
      // input_fidelity override is intentionally omitted for model portability.
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

function creativeBriefSchema(improvePrompt = false) {
  const properties = Object.fromEntries([
    'purpose', 'targetAudience', 'primaryMessage', 'visualStyle', 'brandPersonality',
    'colorPalette', 'subjectMatter', 'composition', 'focalPoint', 'viewingDistance',
  ].map((key) => [key, { type: 'string' }]));
  properties.copy = copySchema();
  properties.textPosition = { type: 'string', enum: ['left', 'center', 'right'] };
  properties.textColor = { type: 'string' };
  properties.accentColor = { type: 'string' };
  if (improvePrompt) properties.improvedPrompt = { type: 'string' };
  return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties };
}

async function structureCreativeBrief({ description, current, dimensions, usage, logoImage, user, idempotencyKey, improvePrompt = false }) {
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
            'Extract the actual requested banner wording into the copy fields. Preserve names, dates, offers, addresses and phone numbers exactly. Leave unprovided fields empty; never invent them. Do not put design instructions into the printed copy. Use a short prominent headline, a secondary offer and smaller contact details. Respect any nonempty exact copy fields supplied by the user.',
            'Choose a left, center or right textPosition and six-digit hex textColor/accentColor with strong contrast. Use a centered, wide text zone for portrait banners and text-only requests.',
            'Art-direct a cohesive finished design with theme-appropriate expressive lettering, strong visual hierarchy, large-format legibility and safe internal margins. Avoid default block type and a generic empty half-canvas text panel. Celebration banners can use playful dimensional lettering; business designs should match their brand. The customer request takes precedence over generic default style selections.',
            ...(logoImage?.buffer ? ['The attached image is the actual uploaded customer logo. Inspect its visible colors and identity. If the request asks for logo/brand colors, derive colorPalette, textColor and accentColor from this image, overriding inherited/default colors. Describe the visible palette concisely with hex values. Otherwise respect explicit customer colors. Plan a balanced layout around one original logo, which will be added afterward; never request a redrawn or duplicate logo. Do not transcribe logo wording into copy fields unless the customer separately requests that wording.'] : []),
            `Physical dimensions: ${dimensions}. Usage: ${usage}.`,
            `Existing user selections to respect when useful: ${JSON.stringify(current)}.`,
            `Customer request to interpret: ${JSON.stringify(description)}.`,
            ...(improvePrompt ? ['Also write improvedPrompt: a polished, ready-to-use banner design request, maximum 1200 characters. Keep the customer\'s intent, theme and every factual detail. Include every nonempty copy value verbatim. Improve composition, expressive typography, hierarchy, color and readability with specific art direction suited to the theme. Do not invent names, dates, offers, phone numbers, URLs, slogans, or uploaded assets. Write plain English as the customer speaking to a designer, no preamble, no markdown, no claim that the result is guaranteed or perfect.'] : []),
          ].join('\n'),
        }, ...(logoImage?.buffer ? [{ type: 'input_image', image_url: `data:${logoImage.mimeType};base64,${logoImage.buffer.toString('base64')}`, detail: 'high' }] : [])],
      }],
      text: {
        format: {
          type: 'json_schema',
          name: 'commercial_print_creative_brief',
          strict: true,
          schema: creativeBriefSchema(improvePrompt),
        },
      },
      max_output_tokens: 4000,
      ...(getValidationModel() === 'gpt-5-mini' ? { reasoning: { effort: 'minimal' } } : {}),
      safety_identifier: user,
    }, options), { idempotencyKey, timeoutMs: 45000 });
    const raw = response.output_text || response.output?.flatMap((item) => item.content || []).find((item) => item.type === 'output_text')?.text;
    return { brief: JSON.parse(raw || ''), requestId: response?._request_id || null, model: getValidationModel() };
  } catch (error) {
    classifyProviderError(error);
  }
}

function copySchema() {
  const { COPY_FIELDS } = require('./schema.cjs');
  return { type: 'object', additionalProperties: false, required: COPY_FIELDS, properties: Object.fromEntries(COPY_FIELDS.map(key => [key, { type: 'string' }])) };
}

async function planDesignEdit({ brief, instruction, photos = [], user, idempotencyKey }) {
  const { ROLES, FONTS } = require('./layers.cjs');
  const fields = {
    x: { type: ['number', 'null'] }, y: { type: ['number', 'null'] },
    scale: { type: ['number', 'null'] }, width: { type: ['number', 'null'] },
    color: { type: ['string', 'null'] }, font: { type: ['string', 'null'], enum: [...FONTS, null] },
  };
  const properties = {
    copy: copySchema(),
    layers: { type: 'object', additionalProperties: false, required: ROLES, properties: Object.fromEntries(ROLES.map(role => [role, { type: 'object', additionalProperties: false, required: Object.keys(fields), properties: fields }])) },
    backgroundInstruction: { type: 'string' },
    removeLogo: { type: 'boolean' },
    removePhotos: { type: 'array', items: { type: 'integer', enum: [0, 1, 2] } },
  };
  const { client } = await getClient();
  try {
    const response = await requestWithTransientRetry(options => client.responses.create({
      model: getValidationModel(),
      input: [{ role: 'user', content: [{ type: 'input_text', text: [
        'Edit this layered commercial banner according to the request. Return complete exact copy and layer settings; preserve all unrelated wording and existing settings.',
        brief.typographyMode === 'ai'
          ? 'The existing design contains artistic AI-rendered lettering. Update the complete approved copy to match requested wording changes. Preserve the original lettering style unless asked to change it. Logo and uploaded photo positions remain protected separate layers. Do not replace artistic fonts with generic font settings unless explicitly requested.'
          : 'Text and logo changes are deterministic. NEVER ask the image model to change words, spelling, fonts, sizes or logos. Put only visual background/image changes in backgroundInstruction; otherwise use an empty string.',
        'Layer x/y are normalized canvas coordinates, width is a normalized text-zone width, scale is relative to default type size. Preserve unspecified values using the current settings or null if unset. Fonts must be from the supplied enum. Colors are six-digit hex. Increase sizes moderately (about 1.2x) when asked for bigger. For logo left/right use x=0.05/0.75; top/bottom use y=0.06/0.7. Remove text by emptying its copy field. Never invent contact information. Only set removeLogo when explicitly requested. removeLogo means remove only the protected customer-uploaded logo overlay; never describe that removal in backgroundInstruction and never remove or alter a logo-like badge, lettering, or artwork already baked into the generated background. For a logo-only removal, keep copy and layers unchanged and return an empty backgroundInstruction.',
        `Uploaded photos are supplied after this text in zero-based order (photo0, photo1, photo2). Return their indexes in removePhotos only if requested. Current design: ${JSON.stringify(brief)}`,
        `Requested change: ${JSON.stringify(instruction)}`,
      ].join('\n') }, ...photos.map(photo => ({ type: 'input_image', image_url: `data:${photo.mimeType};base64,${photo.buffer.toString('base64')}`, detail: 'low' }))] }],
      text: { format: { type: 'json_schema', name: 'banner_layer_edit', strict: true, schema: { type: 'object', additionalProperties: false, required: Object.keys(properties), properties } } },
      max_output_tokens: 6000,
      ...(getValidationModel() === 'gpt-5-mini' ? { reasoning: { effort: 'minimal' } } : {}),
      safety_identifier: user,
    }, options), { idempotencyKey, timeoutMs: 45000 });
    const raw = response.output_text || response.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text;
    return JSON.parse(raw || '');
  } catch (error) { classifyProviderError(error); }
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
  planDesignEdit,
  getValidationModel,
  withTimeout,
};
