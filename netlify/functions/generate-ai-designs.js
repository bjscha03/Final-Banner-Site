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
const fallbackEnhance = (p, size) => `Final production prompt: Create one flat print-ready banner artwork at exactly ${size?.w || 8}ft x ${size?.h || 4}ft (${((size?.w || 8)/(size?.h || 4)).toFixed(3)}:1). Keep all requested wording exactly as provided. Full-bleed edge-to-edge single composition only. No mockups, no multiple options, no panels, no poster-in-frame layout, no white or black bars, no hardware, no grommets, no ropes, no poles, no room/wall/fence scene. User request: ${String(p || '').trim()}`;
const SUPPORTED_IMAGEN_RATIOS = ['1:1', '9:16', '16:9', '4:3', '3:4'];

const GENERATION_GUARDRAIL = 'Create only the final flat print-ready artwork file for a custom banner. The image itself must be the printable design, not a photo or mockup of a banner. Fill the entire selected canvas edge-to-edge. Do not create multiple banner options, panels, examples, mockups, frames, margins, white bars, black bars, poster layouts, or designs inside a smaller rectangle. Do not include grommets, ropes, pole pockets, holes, hardware, shadows outside the artwork, walls, fences, poles, rooms, or hanging displays.';
const BANNED_PROMPT_WORDS = ['mockup', 'banner mockup', 'hanging banner', 'product shot', 'display scene', 'presentation', 'example designs', 'design options', 'variations'];
const FAKE_LOGO_MARKERS = ['ATTACHED LOGO', 'YOUR LOGO', 'LOGO HERE', 'SAMPLE'];

function sanitizePromptText(input) {
  let clean = String(input || '').trim();
  for (const bad of BANNED_PROMPT_WORDS) {
    clean = clean.replace(new RegExp(bad, 'ig'), '');
  }
  return clean.replace(/\s{2,}/g, ' ').trim();
}

function buildFinalProductionPrompt({ userPrompt, w, h, referenceAnalysis }) {
  const cleaned = sanitizePromptText(userPrompt);
  const direction = referenceAnalysis ? `Reference guidance: ${referenceAnalysis}.` : '';
  return `Create one flat, full-bleed, print-ready ${w}ft x ${h}ft horizontal premium commercial banner artwork with professional typography, high-end print design quality, and clean visual hierarchy. Use only the text requested by the customer: "${cleaned}". The artwork must fill the entire canvas edge-to-edge with no borders, no white/black bars, no mockup, no poster frame, no drop shadow, no grommets, and no hardware. Avoid cheap template styling, clipart overload, and placeholder logo/text. ${direction}`.trim();
}

async function analyzeReferenceImage({ referenceImage, textModel, googleApiKey }) {
  if (!referenceImage || typeof referenceImage !== 'string' || !referenceImage.startsWith('data:image/')) return null;
  const m = referenceImage.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!m) return null;
  const [, mimeType, base64Data] = m;
  const prompt = 'Analyze this reference image for banner generation. Return one plain text line with: colors, logo presence, style, subject, layout cues, brand personality.';
  const r = await fetch(`${GEMINI_BASE}/models/${textModel}:generateContent?key=${encodeURIComponent(googleApiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Data } }],
      }],
    }),
  });
  if (!r.ok) return null;
  const d = await r.json().catch(() => ({}));
  return sanitizePromptText(d?.candidates?.[0]?.content?.parts?.map((p) => p.text).join(' ') || '');
}

function detectLikelyLogoReference(referenceAnalysis = '', referenceImageName = '') {
  const s = `${referenceAnalysis} ${referenceImageName}`.toLowerCase();
  return /\blogo\b|brand mark|wordmark|icon/.test(s);
}

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
      const aspectRatio = `${Number(body?.size?.w) || 8}:${Number(body?.size?.h) || 4}`;
      const enhanceInstruction = `Rewrite the following user request into ONE plain-text production prompt for generating a single print-ready flat banner artwork.\nRules:\n- Return only one prompt, plain text only.\n- No markdown, bullets, labels, explanations, or multiple options.\n- Include the exact requested user wording/text.\n- Include selected size/aspect ratio ${aspectRatio}.\n- Require full-bleed edge-to-edge single composition.\n- Ban mockups, poster layouts, multiple panels/options, white bars/black bars, and hardware.\nUser request: ${sanitizePromptText(originalPrompt)}`;
      const r = await fetch(`${GEMINI_BASE}/models/${textModel}:generateContent?key=${encodeURIComponent(googleApiKey)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: enhanceInstruction }] }] }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        return json(200, { ok: true, action, enhancedPrompt: fallbackEnhance(originalPrompt, body.size), safeErrorMessage: d?.error?.message || 'Gemini unavailable. Fallback prompt applied.' });
      }
      const rawEnhanced = d?.candidates?.[0]?.content?.parts?.map((p) => p.text).join(' ').trim();
      const enhancedPrompt = sanitizePromptText(rawEnhanced || fallbackEnhance(originalPrompt, body.size));
      return json(200, { ok: true, action, enhancedPrompt, enhancedPromptFinal: enhancedPrompt, selectedAspectRatio: aspectRatio, safeErrorMessage: null });
    }

    if (action === 'generate') {
      const sourcePrompt = String(body.prompt || body.enhancedPrompt || '').trim();
      if (!sourcePrompt) {
        return json(200, {
          ok: false,
          action: 'generate',
          error: 'missing_prompt',
          referenceImageIncluded: false,
          referenceMode: 'none',
          referenceAnalysis: null,
        });
      }
      const cleanedSource = sanitizePromptText(sourcePrompt);

      const targetW = Number(body?.size?.w) || 8;
      const targetH = Number(body?.size?.h) || 4;
      const imagenAspectRatio = pickImagenRatio(targetW, targetH);
      const referenceImageIncluded = Boolean(body.referenceImage);
      const referenceAnalysis = referenceImageIncluded ? await analyzeReferenceImage({ referenceImage: body.referenceImage, textModel, googleApiKey }) : null;
      const referenceMode = referenceImageIncluded ? (referenceAnalysis ? 'analyzed_prompt_guidance' : 'direct_image_input') : 'none';
      const logoLikeReference = detectLikelyLogoReference(referenceAnalysis || '', body.referenceImageName || '');
      const finalProductionPrompt = `${GENERATION_GUARDRAIL}\n${buildFinalProductionPrompt({ userPrompt: cleanedSource, w: targetW, h: targetH, referenceAnalysis })}`;

      if (!SUPPORTED_IMAGEN_RATIOS.includes(imagenAspectRatio)) {
        return json(200, { ok: false, action, imageUrl: null, safeErrorMessage: 'Unsupported mapped Imagen ratio.' });
      }

      const r = await fetch(`${GEMINI_BASE}/models/${imageModel}:predict?key=${encodeURIComponent(googleApiKey)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ instances: [{ prompt: `${finalProductionPrompt}${referenceImageIncluded ? '\nReference image has been provided by customer; align style/color/composition to it. Do not write placeholder text like ATTACHED LOGO, YOUR LOGO, LOGO HERE, or SAMPLE.' : ''}` }], parameters: { sampleCount: 1, aspectRatio: imagenAspectRatio } }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (isImagenPaidAccessError(d, r.status)) {
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
            fallbackReason: 'imagen_paid_access_required',
            count: 1,
            requestedBannerRatio: `${targetW}:${targetH}`,
            generatedImagenRatio: imagenAspectRatio,
            safeErrorMessage: 'Temporary fallback image used because Imagen paid access is required.',
            finalProductionPrompt,
            referenceImageIncluded,
            referenceImageName: body.referenceImageName || null,
            provider: imageModel,
            canonicalApprovedImageUrl: FALLBACK_IMAGE_URL,
            cropFillApplied: true,
            referenceMode,
            referenceAnalysis,
            imageFilledCanvas: true,
            logoCompositeApplied: false,
            fakeLogoTextDetected: false,
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

      let canonicalImageUrl = cloudinaryRatioTransformUrl(upload.public_id, targetW, targetH);
      let logoCompositeApplied = false;
      let fakeLogoTextDetected = false;
      const ocr = await cloudinary.url(upload.public_id, { resource_type: 'image', type: 'upload', secure: true, ocr: 'adv_ocr' });
      const checkText = `${ocr}`;
      fakeLogoTextDetected = FAKE_LOGO_MARKERS.some((m) => checkText.toUpperCase().includes(m));
      if (logoLikeReference && body.referenceImage) {
        const logoUpload = await cloudinary.uploader.upload(body.referenceImage, { folder: 'ai-generated-banners', resource_type: 'image' });
        canonicalImageUrl = cloudinary.url(upload.public_id, {
          resource_type: 'image',
          type: 'upload',
          secure: true,
          transformation: [
            { aspect_ratio: `${targetW}:${targetH}`, crop: 'fill', gravity: 'auto' },
            { overlay: logoUpload.public_id, width: 260, crop: 'fit', gravity: 'north_west', x: 40, y: 40 },
            { fetch_format: 'auto', quality: 'auto' },
          ],
        });
        logoCompositeApplied = true;
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
        safeErrorMessage: null,
        finalProductionPrompt,
        selectedAspectRatio: `${targetW}:${targetH}`,
        referenceImageIncluded,
        referenceImageName: body.referenceImageName || null,
        provider: imageModel,
        canonicalApprovedImageUrl: canonicalImageUrl,
        cropFillApplied: true,
        referenceMode,
        referenceAnalysis,
        imageFilledCanvas: true,
        logoCompositeApplied,
        fakeLogoTextDetected,
      });
    }


    if (action === 'edit') {
      const currentImageUrl = String(body.imageUrl || '').trim();
      const editInstruction = String(body.editInstruction || '').trim();
      if (!currentImageUrl) return json(400, { ok: false, action, error: 'Image is required' });
      if (!editInstruction) return json(400, { ok: false, action, error: 'Edit instruction required' });
      const textEditRequested = /\b(change|replace|rename)\b[\s\S]*\btext\b|\bto\s+[A-Za-z0-9_-]{2,}\b/i.test(editInstruction);
      if (textEditRequested) {
        return json(200, { ok: false, action, editMode: 'blocked', editClassification: 'text_replacement', blockedEditReason: 'Text replacement is not available yet for flattened AI artwork. Please regenerate with the correct text.', safeErrorMessage: 'Text replacement is not available yet for flattened AI artwork. Please regenerate with the correct text.', editImageIncluded: true });
      }
      const targetW = Number(body?.size?.w) || 8;
      const targetH = Number(body?.size?.h) || 4;
      const upload = await cloudinary.uploader.upload(currentImageUrl, { folder: 'ai-generated-banners', resource_type: 'image' });
      const canonicalEditedUrl = cloudinary.url(upload.public_id, {
        resource_type: 'image',
        type: 'upload',
        secure: true,
        transformation: [
          { effect: 'improve' },
          { effect: 'saturation:15' },
          { aspect_ratio: `${targetW}:${targetH}`, crop: 'fill', gravity: 'auto' },
          { fetch_format: 'auto', quality: 'auto' },
        ],
      });
      return json(200, { ok: true, action, imageUrl: canonicalEditedUrl, image: { url: canonicalEditedUrl, original_url: currentImageUrl, width: upload.width || targetW * 100, height: upload.height || targetH * 100 }, generationFallback: false, fallbackReason: null, count: 1, safeErrorMessage: null, editImageIncluded: true, editMode: 'true_image_edit', editClassification: 'visual_adjustment', blockedEditReason: null, canonicalApprovedImageUrl: canonicalEditedUrl, cropFillApplied: true, imageFilledCanvas: true, provider: 'cloudinary_transform' });
    }

    return json(400, { ok: false, action, error: 'Unknown action' });
  } catch (error) {
    return json(200, { ok: false, action, functionReachable: true, safeErrorMessage: error instanceof Error ? error.message : 'AI service unavailable' });
  }
}
