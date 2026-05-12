const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const REQUIRED_ENV = [
  'GOOGLE_GENAI_API_KEY',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
];

function normalizeTargetDimensions(widthIn, heightIn) {
  const w = Number(widthIn) || 96;
  const h = Number(heightIn) || 48;
  const longEdge = 2400;
  const ratio = w / h;
  if (ratio >= 1) return { widthPx: longEdge, heightPx: Math.max(512, Math.round(longEdge / ratio)) };
  return { widthPx: Math.max(512, Math.round(longEdge * ratio)), heightPx: longEdge };
}

function missingEnv() {
  return REQUIRED_ENV.filter((k) => !process.env[k]);
}

function buildError(detailCode, action, statusCode = 500) {
  return jsonResponse(statusCode, {
    error: action === 'enhance' ? 'enhance_failed' : 'generate_failed',
    detailCode,
  });
}

function jsonResponse(statusCode, payload, extraHeaders = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    ...extraHeaders,
  };
  return { statusCode, headers, body: JSON.stringify(payload ?? {}) };
}

async function enhancePrompt({ prompt, width, height }) {
  const key = process.env.GOOGLE_GENAI_API_KEY;
  const model = 'gemini-2.5-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `Expand this into a commercial print banner prompt with strong readability and hierarchy. Keep exact aspect awareness for ${width}x${height}. Return prompt text only:\n\n${prompt}` }] }],
      generationConfig: { temperature: 0.5, maxOutputTokens: 500 },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error('google_enhance_failed');
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || prompt;
}

async function generateImage({ prompt, width, height }) {
  const key = process.env.GOOGLE_GENAI_API_KEY;
  const model = 'imagen-3.0-generate-002';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${key}`;
  const ratio = Number(width) >= Number(height) ? '16:9' : '9:16';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio: ratio },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error('google_generate_failed');
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  const pred = Array.isArray(data?.predictions) ? data.predictions[0] : null;
  const b64 = pred?.bytesBase64Encoded || pred?.image || pred?.b64Json;
  if (!b64) throw new Error('google_generate_empty');
  return b64;
}

exports.handler = async function(event, context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  try {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') return jsonResponse(400, { error: 'generate_failed', detailCode: 'bad_request' });

  const missing = missingEnv();
  if (missing.length) {
    console.error('[generate-ai-designs] missing env vars', { missing });
    return buildError('missing_env', 'generate', 500);
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return buildError('bad_request', 'generate', 400); }
  const action = body.fastMode ? 'enhance' : 'generate';
  const prompt = String(body.prompt || '').trim();
  const width = Number(body.width || body?.size?.wIn || 96);
  const height = Number(body.height || body?.size?.hIn || 48);

  if (!prompt || !width || !height) return buildError('bad_request', action, 400);

  console.error('[generate-ai-designs] start', {
    action,
    model: action === 'enhance' ? 'gemini-2.5-flash' : 'imagen-3.0-generate-002',
    envPresent: Object.fromEntries(REQUIRED_ENV.map((k) => [k, Boolean(process.env[k])])),
  });

  try {
    if (action === 'enhance') {
      const enhancedPrompt = await enhancePrompt({ prompt, width, height });
      return jsonResponse(200, { enhancedPrompt });
    }

    const enhancedPrompt = await enhancePrompt({ prompt, width, height });
    const imageBase64 = await generateImage({ prompt: enhancedPrompt, width, height });

    let uploaded;
    try {
      uploaded = await cloudinary.uploader.upload(`data:image/png;base64,${imageBase64}`, { folder: 'ai-generated-banners', public_id: `banner-${Date.now()}`, resource_type: 'image', timeout: 45000 });
    } catch (cloudErr) {
      console.error('[generate-ai-designs] cloudinary upload failed', { message: cloudErr?.message, http_code: cloudErr?.http_code, code: cloudErr?.code });
      return buildError('cloudinary_error', action, 500);
    }

    const dims = normalizeTargetDimensions(width, height);
    const correctedUrl = cloudinary.url(uploaded.public_id, {
      secure: true,
      resource_type: 'image',
      type: 'upload',
      transformation: [{ width: dims.widthPx, height: dims.heightPx, crop: 'fill', gravity: 'auto', fetch_format: 'auto', quality: 'auto:best', dpr: 'auto' }],
    });

    return jsonResponse(200, { image: { url: correctedUrl, original_url: uploaded.secure_url, width: dims.widthPx, height: dims.heightPx } });
  } catch (err) {
    console.error('[generate-ai-designs] provider failure', {
      action,
      model: action === 'enhance' ? 'gemini-2.5-flash' : 'imagen-3.0-generate-002',
      status: err?.status || null,
      message: err?.message,
      payload: err?.payload ? JSON.stringify(err.payload).slice(0, 600) : null,
    });
    return buildError('google_api_error', action, 500);
  }
  } catch (err) {
    const action = event?.body && String(event.body).includes('"fastMode":true') ? 'enhance' : 'generate';
    console.error('[generate-ai-designs] unhandled', {
      action,
      name: err?.name || 'Error',
      message: err?.message || 'Unknown error',
      stack: String(err?.stack || '').split('\n')[0] || null,
    });
    return buildError('server_error', action, 500);
  }
};
