const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST,OPTIONS' };
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const fallbackEnhance = (p, size) => `Design a premium ${size?.w || 8}ft x ${size?.h || 4}ft banner. Keep high contrast readable typography, clean hierarchy, and full-bleed composition. Prompt: ${p}`;
const safe = (v) => (typeof v === 'string' ? v : '');

async function models(key) {
  const r = await fetch(`${GEMINI_BASE}/models?key=${encodeURIComponent(key)}`);
  if (!r.ok) throw new Error('models endpoint failed');
  return (await r.json()).models || [];
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };

  const body = JSON.parse(event.body || '{}');
  const key = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  const action = body.action || 'enhance';
  if (!key) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'AI environment not configured' }) };

  try {
    const availableModels = await models(key);
    const textModel = availableModels.find((m) => (m.supportedGenerationMethods || []).includes('generateContent'))?.name?.replace('models/', '') || 'gemini-1.5-flash';
    const imageModel = availableModels.find((m) => m.name?.includes('imagen-4.0-generate-001'))?.name?.replace('models/', '') || 'imagen-3.0-generate-002';

    if (action === 'debug') {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({
        message: 'Debug checks complete',
        checks: {
          functionReachable: true,
          envConfigured: Boolean(key),
          modelsReachable: availableModels.length > 0,
          textModel,
          textSupportsGenerateContent: availableModels.some((m) => m.name?.endsWith(textModel) && (m.supportedGenerationMethods || []).includes('generateContent')),
          imageModel,
          imageModelFound: availableModels.some((m) => m.name?.endsWith(imageModel)),
        }
      }) };
    }

    if (action === 'enhance') {
      const userPrompt = safe(body.prompt).trim();
      if (!userPrompt) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Prompt required' }) };
      const r = await fetch(`${GEMINI_BASE}/models/${textModel}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: `Rewrite for an AI image model to create exactly one print-ready banner design.
${userPrompt}` }] }] })
      });
      if (!r.ok) return { statusCode: 200, headers: CORS, body: JSON.stringify({ enhancedPrompt: fallbackEnhance(userPrompt, body.size), message: 'Gemini temporarily unavailable, fallback prompt applied.' }) };
      const d = await r.json();
      const enhancedPrompt = d?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('\n').trim() || fallbackEnhance(userPrompt, body.size);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ enhancedPrompt, message: 'Prompt enhanced.' }) };
    }

    if (action === 'generate') {
      const prompt = safe(body.enhancedPrompt || body.prompt).trim();
      if (!prompt) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Prompt required' }) };
      const r = await fetch(`${GEMINI_BASE}/models/${imageModel}:predict?key=${encodeURIComponent(key)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: `${body.size?.w || 8}:${body.size?.h || 4}` } })
      });
      if (!r.ok) return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: 'Image generation failed. Try another prompt.', message: 'Imagen request failed cleanly.' }) };
      const d = await r.json();
      const b64 = d?.predictions?.[0]?.bytesBase64Encoded;
      if (!b64) return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: 'No image returned from model.' }) };
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ imageUrl: `data:image/png;base64,${b64}`, message: 'Design generated.' }) };
    }

    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Unknown action' }) };
  } catch (e) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: 'AI service unavailable. Please retry.', message: 'Request handled without crash.' }) };
  }
}
