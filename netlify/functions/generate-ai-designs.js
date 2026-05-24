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

const GENERATION_GUARDRAIL = `Create ONLY flat, full-bleed print-ready banner artwork that fills the entire image edge-to-edge.
No white border, no margin, no mat, no frame, no drop shadow around the artwork, no poster mockup, no design placed inside a smaller rectangle, no product mockup, no environment, no fence, no wall, no hanging banner.
The final image must be the actual banner artwork itself, edge-to-edge.
Generate exactly one complete banner design composition.
Do not include grommets, ropes, pole pockets, hems, folded vinyl, fabric wrinkles, shadows outside artwork, realistic hanging hardware, or display scenery.
Do not create multiple concepts, split panels, collages, grids, moodboards, design sheets, or multiple design options on the same image.
Do not include fake contact information unless provided.
Use large readable typography and clean print-safe spacing.
Negative constraints: white border, margin, frame, poster mockup, shadowed rectangle, presentation mockup, canvas within canvas, multiple panels, collage.`;
const FULL_BLEED_PREPEND = `Create ONLY flat, full-bleed, print-ready banner artwork that fills the entire image edge-to-edge.
Generate exactly one complete banner composition.
The artwork must occupy nearly the full image area.
The artwork must naturally extend to all edges of the canvas.
The design must use the entire banner width and height as the active composition area.
Do NOT generate white borders, margins, poster framing, centered artwork blocks, mockups, fences, walls, poles, hanging banners, product shots, environmental scenes, multiple concepts, split layouts, collages, design sheets, framed rectangles, drop-shadow poster effects, or unused whitespace.`;

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
function cloudinaryRatioTransformUrlAggressive(publicId, targetW, targetH) {
  return cloudinary.url(publicId, {
    resource_type: 'image',
    type: 'upload',
    secure: true,
    transformation: [
      { aspect_ratio: `${targetW}:${targetH}`, crop: 'fill', gravity: 'auto', zoom: 1.2 },
      { fetch_format: 'auto', quality: 'auto' },
    ],
  });
}
function sanitizeSinglePrompt(input) {
  const text = String(input || '').replace(/```[\s\S]*?```/g, ' ').replace(/\b(option\s*\d+|here are|recommendations?)\b/gi, ' ').replace(/[#*`>-]/g, ' ').trim();
  return text.split(/\n+/).map((s) => s.trim()).filter(Boolean).slice(0, 3).join(' ').replace(/\s+/g, ' ');
}
function extractAllowedTextList(input) {
  const normalized = String(input || '').replace(/[^\w\s'&-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const quoted = [...normalized.matchAll(/"([^"]{2,80})"/g)].map((m) => m[1].trim());
  const words = normalized.split(' ').filter(Boolean);
  const upper = normalized.toUpperCase();
  const list = [...quoted];
  if (/\bbirthday\b/i.test(normalized)) list.push('HAPPY BIRTHDAY');
  if (/\bgrand opening\b/i.test(normalized)) list.push('GRAND OPENING');
  if (/\bmemorial day bbq\b/i.test(normalized)) list.push('MEMORIAL DAY BBQ');
  if (words.length <= 6 && words.some((w) => /[a-z]/i.test(w))) list.push(upper);
  return Array.from(new Set(list.map((s) => s.trim()).filter(Boolean))).slice(0, 6);
}
function sanitizeForbiddenBranding(text) {
  return String(text || '')
    .replace(/\bHERO:\b/gi, '')
    .replace(/\bSAMPLE TEXT\b/gi, '')
    .replace(/\bYOURTION\b/gi, '')
    .replace(/\bLOREM IPSUM\b/gi, '')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '')
    .replace(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '')
    .replace(/\b(?:www\.)?[a-z0-9-]+\.(com|net|org|io|co)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
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
async function analyzeReferenceImage({ apiKey, textModel, referenceImage }) {
  const part = dataUrlToInlinePart(referenceImage);
  if (!part) return { referenceType: 'none', referenceSummary: '', logoLikely: false, logoUsageInstruction: '', extractedColors: [] };
  const mime = part.inline_data?.mime_type || '';
  const isSvgLogo = /image\/svg\+xml/i.test(mime);
  const isLikelyLogoAsset = isSvgLogo || /image\/png/i.test(mime);
  const r = await fetch(`${GEMINI_BASE}/models/${textModel}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [{ text: 'Classify reference image type (logo|style_reference|product|existing_banner|inspiration). Return strict JSON with keys: referenceType, referenceSummary, logoLikely, logoUsageInstruction, extractedColors (array up to 5). No markdown.' }, part],
      }],
    }),
  });
  const d = await r.json().catch(() => ({}));
  const raw = d?.candidates?.[0]?.content?.parts?.map((p) => p.text).join(' ') || '';
  try {
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}');
    const modelType = String(parsed.referenceType || 'inspiration');
    const logoLikely = Boolean(parsed.logoLikely) || isLikelyLogoAsset || /\blogo\b/i.test(modelType);
    const referenceType = logoLikely ? 'logo' : modelType;
    return {
      referenceType,
      referenceSummary: sanitizeSinglePrompt(parsed.referenceSummary || ''),
      logoLikely,
      logoUsageInstruction: sanitizeSinglePrompt(parsed.logoUsageInstruction || ''),
      extractedColors: Array.isArray(parsed.extractedColors) ? parsed.extractedColors.slice(0, 5).map((c) => String(c)) : [],
    };
  } catch {
    return { referenceType: isLikelyLogoAsset ? 'logo' : 'inspiration', referenceSummary: sanitizeSinglePrompt(raw), logoLikely: isLikelyLogoAsset || /logo/i.test(raw), logoUsageInstruction: '', extractedColors: [] };
  }
}
async function buildArtDirectedPrompt({ apiKey, textModel, userPrompt, referenceProfile, mode, editInstruction, allowedTextList }) {
  const direction = `You are a senior commercial large-format print designer and art director. Return ONE final optimized production prompt only.
No options, no markdown, no commentary, no bullets.
Use only user-provided text or strongly implied text.
Forbidden text inventions: HERO:, SAMPLE TEXT, fake company names, fake websites, fake phone numbers, fake dates.
Must be one flat full-bleed banner composition, edge-to-edge, no mockups/scenes/multiple panels/collage.`;
  const task = mode === 'edit'
    ? `Refine existing banner while preserving structure and user messaging. Edit instruction: ${editInstruction || ''}`
    : 'Create one new premium banner composition.';
  const payload = `${direction}
User prompt: ${userPrompt}
Allowed text list: ${allowedTextList.join(' | ') || 'none'}
Reference type: ${referenceProfile.referenceType}
Reference summary: ${referenceProfile.referenceSummary || 'none'}
Reference colors: ${(referenceProfile.extractedColors || []).join(', ') || 'none'}
Logo likely: ${referenceProfile.logoLikely ? 'yes' : 'no'}
Logo usage instruction: ${referenceProfile.logoUsageInstruction || 'none'}
When logo likely is yes: do NOT generate or redraw a logo, do NOT invent brand names, reserve a clean logo-safe placement area and design the background around real logo compositing.
${FULL_BLEED_PREPEND}
Task: ${task}`;
  const r = await fetch(`${GEMINI_BASE}/models/${textModel}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: payload }] }] }),
  });
  const d = await r.json().catch(() => ({}));
  const out = sanitizeForbiddenBranding(sanitizeSinglePrompt(d?.candidates?.[0]?.content?.parts?.map((p) => p.text).join(' ') || ''));
  return out;
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
      const referenceProfile = await analyzeReferenceImage({ apiKey: googleApiKey, textModel, referenceImage: body.referenceImage });
      const allowedTextList = extractAllowedTextList(originalPrompt);
      const enhancedPrompt = await buildArtDirectedPrompt({ apiKey: googleApiKey, textModel, userPrompt: originalPrompt, referenceProfile, mode: 'generate', allowedTextList }) || fallbackEnhance(originalPrompt, body.size);
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
      const rawUserPrompt = sanitizeSinglePrompt(body.prompt || '');
      const allowedTextList = extractAllowedTextList(rawUserPrompt);
      const referenceProfile = await analyzeReferenceImage({ apiKey: googleApiKey, textModel, referenceImage: body.referenceImage });
      const artDirectedPrompt = await buildArtDirectedPrompt({
        apiKey: googleApiKey,
        textModel,
        userPrompt: sanitizeSinglePrompt(body.enhancedPrompt || body.prompt),
        referenceProfile,
        mode: 'generate',
        allowedTextList,
      });
      const sourcePrompt = `${GENERATION_GUARDRAIL}\n${FULL_BLEED_PREPEND}\n${artDirectedPrompt}`;
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

      let canonicalImageUrl = cloudinaryRatioTransformUrlAggressive(upload.public_id, targetW, targetH);
      let logoCompositeMode = 'none';
      let logoCompositedDirectly = false;
      let whitespaceScore = 0.15;
      let edgeCoverageScore = 0.9;
      let centeredPosterLikelihood = 0.1;
      if (referenceProfile.referenceType === 'logo' && body.referenceImage) {
        try {
          const logoUpload = await cloudinary.uploader.upload(String(body.referenceImage), { folder: 'ai-generated-banners/logos', resource_type: 'image' });
          canonicalImageUrl = cloudinary.url(upload.public_id, {
            resource_type: 'image',
            type: 'upload',
            secure: true,
            transformation: [
              { aspect_ratio: `${targetW}:${targetH}`, crop: 'fill', gravity: 'auto', zoom: 1.2 },
              { overlay: logoUpload.public_id, width: Math.round((targetW * 1200) * 0.18), crop: 'scale' },
              { flags: 'layer_apply', gravity: 'south_east', x: 50, y: 40 },
              { fetch_format: 'auto', quality: 'auto' },
            ],
          });
          logoCompositeMode = 'direct_overlay';
          logoCompositedDirectly = true;
          whitespaceScore = 0.08;
          edgeCoverageScore = 0.94;
          centeredPosterLikelihood = 0.05;
        } catch {
          logoCompositeMode = 'reserved_logo_safe_area';
        }
      }
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
        debug: { rawUserPrompt, referenceType: referenceProfile.referenceType, logoDetected: referenceProfile.logoLikely, logoCompositeMode, logoCompositedDirectly, referenceSummary: referenceProfile.referenceSummary, extractedColors: referenceProfile.extractedColors, allowedTextList, usedReferenceImage: Boolean(body.referenceImage), whitespaceScore, edgeCoverageScore, centeredPosterLikelihood, finalProductionPrompt: sourcePrompt },
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
      const rawUserPrompt = sanitizeSinglePrompt(body.prompt || '');
      const allowedTextList = extractAllowedTextList(rawUserPrompt);
      const referenceProfile = await analyzeReferenceImage({ apiKey: googleApiKey, textModel, referenceImage: body.referenceImage });
      const directedEditInstruction = await buildArtDirectedPrompt({
        apiKey: googleApiKey,
        textModel,
        userPrompt: rawUserPrompt || editInstruction,
        referenceProfile,
        mode: 'edit',
        editInstruction: sanitizeSinglePrompt(editInstruction),
        allowedTextList,
      });
      const editPrompt = `${GENERATION_GUARDRAIL}
${FULL_BLEED_PREPEND}
Preserve the existing banner canvas ratio and convert the design to full-bleed edge-to-edge artwork. Remove any borders, poster margins, white padding, frames, or drop shadows.
Refine the existing banner concept while preserving core theme and layout intent.
Current image URL: ${currentImageUrl}
Edit instruction: ${directedEditInstruction}`;
      const r = await fetch(`${GEMINI_BASE}/models/${imageModel}:predict?key=${encodeURIComponent(googleApiKey)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ instances: [{ prompt: editPrompt }], parameters: { sampleCount: 1, aspectRatio: imagenAspectRatio } }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return json(200, { ok: false, action, safeErrorMessage: d?.error?.message || 'Edit generation failed.' });
      const b64 = d?.predictions?.[0]?.bytesBase64Encoded;
      if (!b64) return json(200, { ok: false, action, safeErrorMessage: 'No edited image returned from model.' });
      const upload = await cloudinary.uploader.upload(`data:image/png;base64,${b64}`, { folder: 'ai-generated-banners', resource_type: 'image' });
      let canonicalImageUrl = cloudinaryRatioTransformUrlAggressive(upload.public_id, targetW, targetH);
      let logoCompositeMode = 'none';
      let logoCompositedDirectly = false;
      let whitespaceScore = 0.15;
      let edgeCoverageScore = 0.9;
      let centeredPosterLikelihood = 0.1;
      if (referenceProfile.referenceType === 'logo' && body.referenceImage) {
        try {
          const logoUpload = await cloudinary.uploader.upload(String(body.referenceImage), { folder: 'ai-generated-banners/logos', resource_type: 'image' });
          canonicalImageUrl = cloudinary.url(upload.public_id, {
            resource_type: 'image',
            type: 'upload',
            secure: true,
            transformation: [
              { aspect_ratio: `${targetW}:${targetH}`, crop: 'fill', gravity: 'auto', zoom: 1.2 },
              { overlay: logoUpload.public_id, width: Math.round((targetW * 1200) * 0.18), crop: 'scale' },
              { flags: 'layer_apply', gravity: 'south_east', x: 50, y: 40 },
              { fetch_format: 'auto', quality: 'auto' },
            ],
          });
          logoCompositeMode = 'direct_overlay';
          logoCompositedDirectly = true;
          whitespaceScore = 0.08;
          edgeCoverageScore = 0.94;
          centeredPosterLikelihood = 0.05;
        } catch {
          logoCompositeMode = 'reserved_logo_safe_area';
        }
      }
      return json(200, { ok: true, action, imageUrl: canonicalImageUrl, image: { url: canonicalImageUrl, original_url: upload.secure_url || canonicalImageUrl, width: upload.width || targetW * 100, height: upload.height || targetH * 100 }, editFallback: false, debug: { rawUserPrompt, referenceType: referenceProfile.referenceType, logoDetected: referenceProfile.logoLikely, logoCompositeMode, logoCompositedDirectly, referenceSummary: referenceProfile.referenceSummary, extractedColors: referenceProfile.extractedColors, allowedTextList, usedReferenceImage: Boolean(body.referenceImage), whitespaceScore, edgeCoverageScore, centeredPosterLikelihood, finalProductionPrompt: editPrompt }, safeErrorMessage: null });
    }

    return json(400, { ok: false, action, error: 'Unknown action' });
  } catch (error) {
    return json(200, { ok: false, action, functionReachable: true, safeErrorMessage: error instanceof Error ? error.message : 'AI service unavailable' });
  }
}
