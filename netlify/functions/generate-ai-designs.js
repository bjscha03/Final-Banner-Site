import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const REQUIRED_ENV = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
];
const ENHANCE_REQUIRED_ENV = ['GOOGLE_GENAI_API_KEY'];

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (statusCode, payload) => ({ statusCode, headers, body: JSON.stringify(payload ?? {}) });

const normalizeTargetDimensions = (widthIn, heightIn) => {
  const w = Number(widthIn) || 96;
  const h = Number(heightIn) || 48;
  const longEdge = 2400;
  const ratio = w / h;
  return ratio >= 1
    ? { widthPx: longEdge, heightPx: Math.max(512, Math.round(longEdge / ratio)) }
    : { widthPx: Math.max(512, Math.round(longEdge * ratio)), heightPx: longEdge };
};

const missingEnv = (keys) => keys.filter((k) => !process.env[k]);

async function enhancePrompt(prompt, width, height) {
  const key = process.env.GOOGLE_GENAI_API_KEY;
  if (!key) throw new Error('enhance_missing_key');
  const model = await pickEnhanceModel(key);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `Enhance this into a professional commercial banner prompt: ${prompt}`,
            },
          ],
        },
      ],
    }),
  });
  const rawText = await res.text();
  let data = {};
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = {};
  }
  if (!res.ok) {
    console.error('[generate-ai-designs] Gemini enhance request failed', {
      status: res.status,
      responseText: rawText?.slice(0, 1000) || '',
    });
    const safeMessage = data?.error?.message || data?.error?.status || `HTTP_${res.status}`;
    const err = new Error(`enhance_failed_${res.status}`);
    err.providerStatus = res.status;
    err.providerMessage = String(safeMessage).slice(0, 240);
    throw err;
  }
  return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || prompt;
}

async function listGoogleModels(key) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`models_list_failed_${res.status}`);
    err.providerStatus = res.status;
    err.providerMessage = data?.error?.message || `HTTP_${res.status}`;
    throw err;
  }
  return Array.isArray(data?.models) ? data.models : [];
}

async function pickEnhanceModel(key) {
  const models = await listGoogleModels(key);
  const eligible = models.filter((m) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'));
  const flash = eligible.find((m) => String(m?.name || '').toLowerCase().includes('flash'));
  const picked = flash || eligible[0];
  if (!picked?.name) throw new Error('no_generate_content_model_available');
  return String(picked.name).replace(/^models\//, '');
}

async function generateImage(prompt, width, height) {
  const key = process.env.GOOGLE_GENAI_API_KEY;
  if (!key) throw new Error('missing_google_key');
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${key}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio: Number(width) >= Number(height) ? '16:9' : '9:16' },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`generate_failed_${res.status}`);
  const pred = Array.isArray(data?.predictions) ? data.predictions[0] : null;
  const b64 = pred?.bytesBase64Encoded || pred?.image || pred?.b64Json;
  if (!b64) throw new Error('generate_empty');
  return b64;
}

export const handler = async (event, context) => {
  console.log('[generate-ai-designs] invoked', { method: event?.httpMethod });
  try {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod === 'GET') {
      if (event?.queryStringParameters?.action === 'models') {
        const key = process.env.GOOGLE_GENAI_API_KEY;
        if (!key) return json(500, { error: 'enhance_failed', detailCode: 'missing_env' });
        try {
          const models = await listGoogleModels(key);
          return json(200, {
            ok: true,
            models: models.map((m) => ({
              name: m?.name || null,
              supportedGenerationMethods: m?.supportedGenerationMethods || [],
            })),
          });
        } catch (err) {
          return json(500, { error: 'enhance_failed', detailCode: 'google_api_error', providerMessage: err?.providerMessage || err?.message || 'model list failed' });
        }
      }
      return json(200, {
        ok: true,
        function: 'generate-ai-designs',
        envPresent: {
          GOOGLE_GENAI_API_KEY: !!process.env.GOOGLE_GENAI_API_KEY,
          CLOUDINARY_CLOUD_NAME: !!process.env.CLOUDINARY_CLOUD_NAME,
          CLOUDINARY_API_KEY: !!process.env.CLOUDINARY_API_KEY,
          CLOUDINARY_API_SECRET: !!process.env.CLOUDINARY_API_SECRET,
        },
      });
    }
    if (event.httpMethod !== 'POST') return json(400, { error: 'generate_failed', detailCode: 'bad_request' });

    let body = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return json(400, { error: 'enhance_failed', detailCode: 'parse_error' });
    }
    if (body?.action === 'debug') {
      return json(200, { ok: true, message: 'generate-ai-designs function reachable', envPresent: {
        GOOGLE_GENAI_API_KEY: !!process.env.GOOGLE_GENAI_API_KEY,
        CLOUDINARY_CLOUD_NAME: !!process.env.CLOUDINARY_CLOUD_NAME,
        CLOUDINARY_API_KEY: !!process.env.CLOUDINARY_API_KEY,
        CLOUDINARY_API_SECRET: !!process.env.CLOUDINARY_API_SECRET,
      } });
    }

    const action = body.action === 'enhance' || body.fastMode ? 'enhance' : 'generate';
    const prompt = String(body.prompt || '').trim();
    const width = Number(body.width || body?.size?.wIn || 96);
    const height = Number(body.height || body?.size?.hIn || 48);
    if (action === 'enhance' && !prompt) return json(400, { error: 'enhance_failed', detailCode: 'missing_prompt' });
    if (!prompt || !width || !height) return json(400, { error: action === 'enhance' ? 'enhance_failed' : 'generate_failed', detailCode: 'bad_request' });

    if (action === 'enhance') {
      console.log('[generate-ai-designs] enhance diagnostics', {
        action: 'enhance',
        hasPrompt: !!prompt,
        model: 'gemini-2.5-flash',
      });
      const missing = missingEnv(ENHANCE_REQUIRED_ENV);
      if (missing.length) {
        console.error('[generate-ai-designs] enhance missing env', { missing });
        return json(500, { error: 'enhance_failed', detailCode: 'missing_env' });
      }
      try {
        const enhancedPrompt = await enhancePrompt(prompt, width, height);
        return json(200, { enhancedPrompt });
      } catch (err) {
        console.error('[generate-ai-designs] Gemini enhance failed', {
          status: err?.providerStatus || null,
          providerMessage: err?.providerMessage || err?.message || null,
        });
        return json(500, {
          error: 'enhance_failed',
          detailCode: 'google_api_error',
          providerMessage: err?.providerMessage || 'Gemini request failed',
        });
      }
    }

    const missing = missingEnv(REQUIRED_ENV);
    if (missing.length) {
      console.error('[generate-ai-designs] generate missing env', { missing });
      return json(500, { error: 'generate_failed', detailCode: 'missing_env' });
    }

    const enhancedPrompt = await enhancePrompt(prompt, width, height);
    const imageBase64 = await generateImage(enhancedPrompt, width, height);
    const uploaded = await cloudinary.uploader.upload(`data:image/png;base64,${imageBase64}`, { folder: 'ai-generated-banners', public_id: `banner-${Date.now()}`, resource_type: 'image', timeout: 45000 });
    const dims = normalizeTargetDimensions(width, height);
    const correctedUrl = cloudinary.url(uploaded.public_id, {
      secure: true,
      resource_type: 'image',
      type: 'upload',
      transformation: [{ width: dims.widthPx, height: dims.heightPx, crop: 'fill', gravity: 'auto', fetch_format: 'auto', quality: 'auto:best', dpr: 'auto' }],
    });

    return json(200, { image: { url: correctedUrl, original_url: uploaded.secure_url, width: dims.widthPx, height: dims.heightPx } });
  } catch (error) {
    console.error('[generate-ai-designs] unhandled', { name: error?.name, message: error?.message });
    return json(500, { error: 'generate_failed', detailCode: 'server_error' });
  }
};
