'use strict';

const { getImageModel, getValidationModel, getTimeoutMs } = require('./config.cjs');

let cachedClient;
const accessCache = new Map();

async function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error('OPENAI_API_KEY is not configured.');
    error.code = 'AI_NOT_CONFIGURED';
    throw error;
  }
  if (!cachedClient) {
    const sdk = await import('openai');
    cachedClient = { client: new sdk.default({ apiKey: process.env.OPENAI_API_KEY }), toFile: sdk.toFile };
  }
  return cachedClient;
}

function classifyProviderError(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  const code = String(error?.code || '');
  if ([401, 403, 404].includes(status) || code === 'model_not_found') {
    const safe = new Error('GPT Image 2 is unavailable to the configured project.');
    safe.code = 'MODEL_ACCESS_DENIED';
    throw safe;
  }
  if (status === 429) {
    const safe = new Error('OpenAI rate limit reached.');
    safe.code = 'PROVIDER_RATE_LIMITED';
    throw safe;
  }
  if (
    error?.name === 'AbortError'
    || error?.name === 'APIConnectionTimeoutError'
    || error?.cause?.name === 'AbortError'
    || ['ETIMEDOUT', 'ECONNABORTED'].includes(code)
  ) {
    const safe = new Error('OpenAI image request timed out.');
    safe.code = 'PROVIDER_TIMEOUT';
    throw safe;
  }
  if (status === 429 || status >= 500) {
    const safe = new Error('OpenAI is temporarily unavailable.');
    safe.code = 'PROVIDER_UNAVAILABLE';
    throw safe;
  }
  if (status === 400 || ['moderation_blocked', 'image_generation_user_error'].includes(code)) {
    const safe = new Error('OpenAI could not create this request as written. Adjust the description or supplied image and try again.');
    safe.code = 'PROVIDER_USER_ERROR';
    throw safe;
  }
  const safe = new Error('OpenAI image request failed.');
  safe.code = 'PROVIDER_REQUEST_FAILED';
  throw safe;
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

async function generateImage({ prompt, size, user }) {
  const { client } = await getClient();
  const model = getImageModel();
  try {
    const response = await withTimeout((signal) => client.images.generate({
      model,
      prompt,
      n: 1,
      size,
      quality: 'high',
      output_format: 'jpeg',
      output_compression: 90,
      background: 'opaque',
      moderation: 'auto',
      user,
    }, { signal }));
    return { ...resultFromResponse(response), model };
  } catch (error) {
    classifyProviderError(error);
  }
}

async function editImage({ prompt, size, currentImage, currentMime = 'image/jpeg', maskImage, referenceImage, user }) {
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
    const response = await withTimeout((signal) => client.images.edit({
      model,
      image: images,
      ...(mask ? { mask } : {}),
      prompt,
      n: 1,
      size,
      quality: 'high',
      // GPT Image 2 always processes image inputs at high fidelity and rejects
      // an explicit input_fidelity override.
      output_format: 'jpeg',
      output_compression: 90,
      background: 'opaque',
      moderation: 'auto',
      user,
    }, { signal }));
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

async function structureCreativeBrief({ description, current, dimensions, usage, user }) {
  const { client } = await getClient();
  try {
    const response = await withTimeout((signal) => client.responses.create({
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
    }, { signal }));
    const raw = response.output_text || response.output?.flatMap((item) => item.content || []).find((item) => item.type === 'output_text')?.text;
    return { brief: JSON.parse(raw || ''), requestId: response?._request_id || null, model: getValidationModel() };
  } catch (error) {
    classifyProviderError(error);
  }
}

module.exports = {
  getClient,
  verifyModelAccess,
  verifyValidationModelAccess,
  generateImage,
  editImage,
  structureCreativeBrief,
  getValidationModel,
  withTimeout,
};
