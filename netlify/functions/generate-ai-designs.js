import { v2 as cloudinary } from 'cloudinary';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const json = (statusCode, payload) => ({ statusCode, headers: CORS, body: JSON.stringify(payload) });
const fallbackEnhance = (p, size) => `Create a premium ${size?.w || 8}ft x ${size?.h || 4}ft full-bleed banner design with bold readable typography, clean hierarchy, high contrast, and print-ready spacing. Flat artwork only, exactly one composition, no mockup or real-world scene. Theme: ${p}`;
const SUPPORTED_IMAGEN_RATIOS = ['1:1', '9:16', '16:9', '4:3', '3:4'];

const GENERATION_GUARDRAIL = `Create flat, full-bleed, print-ready banner artwork only.
Generate exactly one complete banner design composition.
The artwork must fill the entire canvas edge to edge.
Do not generate a mockup.
Do not generate a banner hanging on a fence, wall, building, pole, table, room, street, stadium, or real-world environment.
Do not include grommets, ropes, pole pockets, hems, folded vinyl, fabric wrinkles, shadows outside artwork, realistic hanging hardware, or display scenery.
Do not create multiple concepts, split panels, collages, grids, moodboards, or design sheets.
Do not create multiple design options on the same image.
Do not include fake contact information unless provided.
Use large readable typography and clean print-safe spacing.`;

const FALLBACK_IMAGE_URL = 'https://res.cloudinary.com/dtrxl120u/image/upload/f_auto,q_auto,w_1600,h_800,c_fill/v1769209469/White-Label_Banners_-2_from_4over_nedg8n.png';

function isImagenPaidAccessError(payload, status) {
  const msg = String(payload?.error?.message || payload?.message || '').toLowerCase();
  return status === 403 || status === 402 || msg.includes('billing') || msg.includes('paid') || msg.includes('not enabled') || msg.includes('permission') || msg.includes('access') || msg.includes('quota');
}


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

function pickImagenRatio(w, h) {
  const width = Number(w) || 8;
  const height = Number(h) || 4;
  const r = width / height;
  if (Math.abs(r - 1) < 0.05) return '1:1';
  if (r > 1) {
    if (Math.abs(r - 2) < 0.2) return '16:9'; // required mapping for 2:1 banners
    return Math.abs(r - 16 / 9) <= Math.abs(r - 4 / 3) ? '16:9' : '4:3';
  }
  return Math.abs(r - 3 / 4) <= Math.abs(r - 9 / 16) ? '3:4' : '9:16';
}

function cloudinaryRatioTransformUrl(publicId, targetW, targetH) {
  return cloudinary.url(publicId, {
    resource_type: 'image',
    type: 'upload',
    secure: true,
    transformation: [
      { aspect_ratio: `${targetW}:${targetH}`, crop: 'fill', gravity: 'auto' },
      { fetch_format: 'auto', quality: 'auto' },
    ],
  });
}
function sanitizeSinglePrompt(input) {
  const text = String(input || '').replace(/```[\s\S]*?```/g, ' ').replace(/\b(option\s*\d+|here are|recommendations?)\b/gi, ' ').replace(/[#*`>-]/g, ' ').trim();
  return text.split(/\n+/).map((s) => s.trim()).filter(Boolean).slice(0, 3).join(' ').replace(/\s+/g, ' ');
}
function dataUrlToInlinePart(dataUrl) {
  const m = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!m) return null;
  return { inline_data: { mime_type: m[1], data: m[2] } };
}
async function summarizeReferenceImage({ apiKey, textModel, referenceImage }) {
  const part = dataUrlToInlinePart(referenceImage);
  if (!part) return '';
  const r = await fetch(`${GEMINI_BASE}/models/${textModel}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Summarize this reference image for banner design in one sentence: likely logo/brand cues, dominant colors, typography feel, and layout inspiration. No preface.' }, part] }] }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return '';
  return sanitizeSinglePrompt(d?.candidates?.[0]?.content?.parts?.map((p) => p.text).join(' ') || '');
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
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { ok: false, error: 'Invalid JSON body' }); }
  const action = body.action || 'enhance';

  if (!googleApiKey) {
    return json(200, {
      ok: false, action, functionReachable: true,
      env: { hasGoogleApiKey: Boolean(googleApiKey) }, matchedEnvName,
      error: 'AI environment not configured',
    });
  }

  try {
    const models = await fetchModels(googleApiKey);
    const { textModel, imageModel } = resolveModels(models);

    if (action === 'debug') {
      return json(200, {
        ok: true, action, functionReachable: true,
        env: { hasGoogleApiKey: Boolean(googleApiKey) }, matchedEnvName,
        modelsEndpointReachable: models.length > 0,
        selectedTextModel: textModel,
        selectedImageModel: imageModel,
        safeErrorMessage: null,
      });
    }

    if (action === 'enhance') {
      const originalPrompt = String(body.prompt || '').trim();
      if (!originalPrompt) return json(400, { ok: false, action, error: 'Prompt required' });
      const referenceSummary = await summarizeReferenceImage({ apiKey: googleApiKey, textModel, referenceImage: body.referenceImage });
      const r = await fetch(`${GEMINI_BASE}/models/${textModel}:generateContent?key=${encodeURIComponent(googleApiKey)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: `Return exactly one plain-text production prompt for a single flat print-ready banner design. No bullets, no options, no markdown, no analysis, no headings. Include composition, palette, typography direction, mood, and readability. Keep concise.
User request: ${originalPrompt}
Reference cues: ${referenceSummary || 'none'}` }] }] }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        return json(200, { ok: true, action, enhancedPrompt: fallbackEnhance(originalPrompt, body.size), safeErrorMessage: d?.error?.message || 'Gemini unavailable. Fallback prompt applied.' });
      }
      const enhancedPrompt = sanitizeSinglePrompt(d?.candidates?.[0]?.content?.parts?.map((p) => p.text).join(' ') || '') || fallbackEnhance(originalPrompt, body.size);
      return json(200, { ok: true, action, enhancedPrompt, safeErrorMessage: null });
    }
    if (action === 'enhanceEdit') {
      const editInstruction = String(body.editInstruction || '').trim();
      if (!editInstruction) return json(400, { ok: false, action, error: 'Edit instruction required' });
      const r = await fetch(`${GEMINI_BASE}/models/${textModel}:generateContent?key=${encodeURIComponent(googleApiKey)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: `Rewrite as one direct banner edit instruction only. No options, no explanation. Preserve existing composition and keep artwork flat, full-bleed, print-ready: ${editInstruction}` }] }] }),
      });
      const d = await r.json().catch(() => ({}));
      const enhancedEditPrompt = sanitizeSinglePrompt(d?.candidates?.[0]?.content?.parts?.map((p) => p.text).join(' ') || editInstruction);
      return json(200, { ok: true, action, enhancedEditPrompt });
    }

    if (action === 'generate') {
      const referenceSummary = await summarizeReferenceImage({ apiKey: googleApiKey, textModel, referenceImage: body.referenceImage });
      const sourcePrompt = `${GENERATION_GUARDRAIL}\n${sanitizeSinglePrompt(body.enhancedPrompt || body.prompt)}${referenceSummary ? `\nReference direction: ${referenceSummary}` : ''}`;
      if (!sourcePrompt) return json(400, { ok: false, action, error: 'Prompt required' });

      const targetW = Number(body?.size?.w) || 8;
      const targetH = Number(body?.size?.h) || 4;
      const imagenAspectRatio = pickImagenRatio(targetW, targetH);

      if (!SUPPORTED_IMAGEN_RATIOS.includes(imagenAspectRatio)) {
        return json(200, { ok: false, action, imageUrl: null, safeErrorMessage: 'Unsupported mapped Imagen ratio.' });
      }

      const r = await fetch(`${GEMINI_BASE}/models/${imageModel}:predict?key=${encodeURIComponent(googleApiKey)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ instances: [{ prompt: sourcePrompt }], parameters: { sampleCount: 1, aspectRatio: imagenAspectRatio } }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (isImagenPaidAccessError(d, r.status)) {
          const imagenProviderMessage = String(d?.error?.message || d?.message || 'Unknown provider error');
          const imagenRawResponseFirst500 = JSON.stringify(d || {}).slice(0, 500);
          const fallbackReason = 'imagen_paid_access_required';
          return json(200, {
            ok: true,
            action,
            imageUrl: FALLBACK_IMAGE_URL,
            image: {
              url: FALLBACK_IMAGE_URL,
              original_url: FALLBACK_IMAGE_URL,
              width: targetW * 100,
              height: targetH * 100,
            },
            generationFallback: true,
            fallbackReason,
            imagenStatus: r.status,
            imagenProviderMessage,
            selectedImageModel: imageModel,
            imagenRawResponseFirst500,
            count: 1,
            requestedBannerRatio: `${targetW}:${targetH}`,
            generatedImagenRatio: imagenAspectRatio,
            safeErrorMessage: 'Temporary fallback image used because Imagen paid access is required.',
          });
        }
        return json(200, { ok: false, action, imageUrl: null, safeErrorMessage: d?.error?.message || 'Image generation failed. Please try again.' });
      }

      const b64 = d?.predictions?.[0]?.bytesBase64Encoded;
      if (!b64) return json(200, { ok: false, action, imageUrl: null, safeErrorMessage: 'No image returned from model.' });

      if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        return json(200, { ok: false, action, imageUrl: null, safeErrorMessage: 'Cloudinary not configured for ratio correction.' });
      }

      const upload = await cloudinary.uploader.upload(`data:image/png;base64,${b64}`, {
        folder: 'ai-generated-banners',
        resource_type: 'image',
      });

      const canonicalImageUrl = cloudinaryRatioTransformUrl(upload.public_id, targetW, targetH);
      return json(200, {
        ok: true,
        action,
        imageUrl: canonicalImageUrl,
        image: {
          url: canonicalImageUrl,
          original_url: upload.secure_url || canonicalImageUrl,
          width: upload.width || targetW * 100,
          height: upload.height || targetH * 100,
        },
        generationFallback: false,
        fallbackReason: null,
        count: 1,
        requestedBannerRatio: `${targetW}:${targetH}`,
        generatedImagenRatio: imagenAspectRatio,
        safeErrorMessage: null,
      });
    }


    if (action === 'edit') {
      const currentImageUrl = String(body.imageUrl || '').trim();
      const editInstruction = String(body.editInstruction || '').trim();
      if (!currentImageUrl) return json(400, { ok: false, action, error: 'Image is required' });
      if (!editInstruction) return json(400, { ok: false, action, error: 'Edit instruction required' });
      const targetW = Number(body?.size?.w) || 8;
      const targetH = Number(body?.size?.h) || 4;
      const imagenAspectRatio = pickImagenRatio(targetW, targetH);
      const referenceSummary = await summarizeReferenceImage({ apiKey: googleApiKey, textModel, referenceImage: body.referenceImage });
      const editPrompt = `${GENERATION_GUARDRAIL}
Refine the existing banner concept while preserving core theme and layout intent.
Current image URL: ${currentImageUrl}
Edit instruction: ${sanitizeSinglePrompt(editInstruction)}
${referenceSummary ? `Reference direction: ${referenceSummary}` : ''}`;
      const r = await fetch(`${GEMINI_BASE}/models/${imageModel}:predict?key=${encodeURIComponent(googleApiKey)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ instances: [{ prompt: editPrompt }], parameters: { sampleCount: 1, aspectRatio: imagenAspectRatio } }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return json(200, { ok: false, action, safeErrorMessage: d?.error?.message || 'Edit generation failed.' });
      const b64 = d?.predictions?.[0]?.bytesBase64Encoded;
      if (!b64) return json(200, { ok: false, action, safeErrorMessage: 'No edited image returned from model.' });
      const upload = await cloudinary.uploader.upload(`data:image/png;base64,${b64}`, { folder: 'ai-generated-banners', resource_type: 'image' });
      const canonicalImageUrl = cloudinaryRatioTransformUrl(upload.public_id, targetW, targetH);
      return json(200, { ok: true, action, imageUrl: canonicalImageUrl, image: { url: canonicalImageUrl, original_url: upload.secure_url || canonicalImageUrl, width: upload.width || targetW * 100, height: upload.height || targetH * 100 }, editFallback: false, safeErrorMessage: null });
    }

    return json(400, { ok: false, action, error: 'Unknown action' });
  } catch (error) {
    return json(200, { ok: false, action, functionReachable: true, safeErrorMessage: error instanceof Error ? error.message : 'AI service unavailable' });
  }
}
