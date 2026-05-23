const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const json = (statusCode, payload) => ({ statusCode, headers: CORS, body: JSON.stringify(payload) });
const fallbackEnhance = (p, size) => `Design a premium ${size?.w || 8}ft x ${size?.h || 4}ft banner. Keep high contrast readable typography, clean hierarchy, and full-bleed composition. Prompt: ${p}`;

async function fetchModels(apiKey) {
  const r = await fetch(`${GEMINI_BASE}/models?key=${encodeURIComponent(apiKey)}`);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.error?.message || 'models endpoint failed');
  return body.models || [];
}

function resolveModels(models) {
  const textModel = models.find((m) => (m.supportedGenerationMethods || []).includes('generateContent'))?.name?.replace('models/', '') || 'gemini-1.5-flash';
  const imageModel = models.find((m) => m.name?.includes('imagen-4.0-generate-001'))?.name?.replace('models/', '')
    || models.find((m) => m.name?.includes('imagen'))?.name?.replace('models/', '')
    || 'imagen-3.0-generate-002';
  return { textModel, imageModel };
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const googleApiKey =
    process.env.GOOGLE_GENAI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_AI_API_KEY ||
    '';

  const matchedEnvName = process.env.GOOGLE_GENAI_API_KEY
    ? 'GOOGLE_GENAI_API_KEY'
    : process.env.GEMINI_API_KEY
      ? 'GEMINI_API_KEY'
      : process.env.GOOGLE_AI_API_KEY
        ? 'GOOGLE_AI_API_KEY'
        : null;

  console.log('[generate-ai-designs] matched env var:', matchedEnvName || 'none');

  if (event.httpMethod === 'GET') {
    return json(200, {
      ok: true,
      action: 'health',
      functionReachable: true,
      env: { hasGoogleApiKey: Boolean(googleApiKey) },
      matchedEnvName,
      timestamp: new Date().toISOString(),
    });
  }

  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON body' });
  }

  const action = body.action || 'enhance';

  if (!googleApiKey) {
    return json(200, {
      ok: false,
      action,
      functionReachable: true,
      env: { hasGoogleApiKey: Boolean(googleApiKey) },
      matchedEnvName,
      error: 'AI environment not configured',
    });
  }

  try {
    const models = await fetchModels(googleApiKey);
    const { textModel, imageModel } = resolveModels(models);

    if (action === 'debug') {
      return json(200, {
        ok: true,
        action,
        functionReachable: true,
        env: { hasGoogleApiKey: Boolean(googleApiKey) },
        matchedEnvName,
        modelsEndpointReachable: models.length > 0,
        selectedTextModel: textModel,
        selectedImageModel: imageModel,
        safeErrorMessage: null,
      });
    }

    if (action === 'enhance') {
      const originalPrompt = String(body.prompt || '').trim();
      if (!originalPrompt) return json(400, { ok: false, action, error: 'Prompt required' });

      const r = await fetch(`${GEMINI_BASE}/models/${textModel}:generateContent?key=${encodeURIComponent(googleApiKey)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `Rewrite this into a stronger image-generation prompt for a single large-format banner design:\n${originalPrompt}` }] }],
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        return json(200, {
          ok: true,
          action,
          enhancedPrompt: fallbackEnhance(originalPrompt, body.size),
          safeErrorMessage: d?.error?.message || 'Gemini unavailable. Fallback prompt applied.',
        });
      }

      const enhancedPrompt = d?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('\n').trim() || fallbackEnhance(originalPrompt, body.size);
      return json(200, { ok: true, action, enhancedPrompt, safeErrorMessage: null });
    }

    if (action === 'generate') {
      const sourcePrompt = String(body.enhancedPrompt || body.prompt || '').trim();
      if (!sourcePrompt) return json(400, { ok: false, action, error: 'Prompt required' });

      const r = await fetch(`${GEMINI_BASE}/models/${imageModel}:predict?key=${encodeURIComponent(googleApiKey)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt: sourcePrompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: `${body?.size?.w || 8}:${body?.size?.h || 4}`,
          },
        }),
      });
      const d = await r.json().catch(() => ({}));

      if (!r.ok) {
        return json(200, {
          ok: false,
          action,
          imageUrl: null,
          safeErrorMessage: d?.error?.message || 'Image generation failed. Please try again.',
        });
      }

      const b64 = d?.predictions?.[0]?.bytesBase64Encoded;
      if (!b64) {
        return json(200, { ok: false, action, imageUrl: null, safeErrorMessage: 'No image returned from model.' });
      }

      return json(200, { ok: true, action, imageUrl: `data:image/png;base64,${b64}`, count: 1, safeErrorMessage: null });
    }

    return json(400, { ok: false, action, error: 'Unknown action' });
  } catch (error) {
    return json(200, {
      ok: false,
      action,
      functionReachable: true,
      safeErrorMessage: error instanceof Error ? error.message : 'AI service unavailable',
    });
  }
}
