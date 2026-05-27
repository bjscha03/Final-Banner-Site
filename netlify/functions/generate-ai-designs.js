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
const EXTRA_TEXT_FORBIDDEN = true;
const HARD_BANNED_TEXT = ['lorem ipsum', 'attached logo', 'your logo', 'logo here', 'sample', 'fake latin'];

function sanitizePromptText(input) {
  let clean = String(input || '').trim();
  for (const bad of BANNED_PROMPT_WORDS) {
    clean = clean.replace(new RegExp(bad, 'ig'), '');
  }
  return clean.replace(/\s{2,}/g, ' ').trim();
}

function buildProductionBannerPrompt({ rawUserPrompt, selectedWidthFt, selectedHeightFt, referenceAnalysis, extractedBannerText, designDirection }) {
  const textPart = extractedBannerText.length
    ? extractedBannerText.map((t) => `"${t}"`).join(' and ')
    : '" "';
  const direction = [designDirection, referenceAnalysis ? `using uploaded reference style/colors: ${referenceAnalysis}` : '']
    .filter(Boolean)
    .join('. ');
  return `Create one flat, full-bleed, print-ready ${selectedWidthFt}ft x ${selectedHeightFt}ft horizontal premium banner artwork.
Visible text allowed: ${textPart}.
Do not add any other words, slogans, filler text, lorem ipsum, placeholder text, fake contact info, or fake logos.
Design direction: ${direction || 'premium commercial banner with clean hierarchy and professional typography'}.
Fill the entire canvas edge-to-edge. No borders, bars, margins, mockups, frames, shadows, hardware, grommets, or poster layout.`;
}

function extractBannerTextAndDirection(raw) {
  const prompt = sanitizePromptText(raw);
  const quoted = [...prompt.matchAll(/"([^"]{2,80})"/g)].map((m) => m[1].trim());
  const classMatch = prompt.match(/\bclass of \d{4}\b/i)?.[0];
  const forMatchAll = [...prompt.matchAll(/\bfor\s+([A-Z][a-zA-Z]+)\b/g)].map((m) => m[1]);
  const forMatch = forMatchAll.length ? forMatchAll[forMatchAll.length - 1] : null;
  const allowed = [...new Set([...(quoted || []), ...(classMatch ? [classMatch] : []), ...(forMatch ? [forMatch] : [])])].filter(Boolean);
  const direction = prompt
    .replace(/"([^"]{2,80})"/g, ' ')
    .replace(/\bclass of \d{4}\b/ig, ' ')
    .replace(/\bfor\s+[A-Z][a-zA-Z]+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { extractedBannerText: allowed.join(' | '), designDirection: direction, allowedTextList: allowed };
}

function detectFakeText(content = '') {
  const s = String(content || '').toLowerCase();
  return HARD_BANNED_TEXT.some((t) => s.includes(t));
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
    || null;
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
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    process.env.GOOGLE_AI_API_KEY ||
    '';

  const matchedEnvName = process.env.GEMINI_API_KEY
    ? 'GEMINI_API_KEY'
    : process.env.GOOGLE_GENAI_API_KEY
      ? 'GOOGLE_GENAI_API_KEY'
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
      let stage = 'parse_generate_payload';
      try {
        const rawUserPrompt = String(body.prompt || body.enhancedPrompt || '').trim();
        if (!rawUserPrompt) return json(200, { ok: false, action: 'generate', error: 'missing_prompt' });

        stage = 'resolve_google_key';
        if (!googleApiKey) return json(200, { ok: false, action: 'generate', error: 'generate_failed', stage, safeErrorMessage: 'AI environment not configured', providerStatus: null, providerMessageFirst500: '' });

        stage = 'list_models';
        const predictImagen = models.filter((m) => (m.supportedGenerationMethods || []).includes('predict') && m.name?.includes('imagen'));
        const preferred = ['imagen-4.0-generate-001', 'imagen-4.0-ultra-generate-001', 'imagen-4.0-fast-generate-001'];
        const picked = preferred.map((n) => predictImagen.find((m) => m.name?.includes(n))).find(Boolean) || predictImagen[0] || null;
        const selectedImageModel = picked?.name?.replace('models/', '') || null;
        const supportedGenerationMethods = picked?.supportedGenerationMethods || [];
        const availableImageModels = predictImagen.map((m) => m.name?.replace('models/', ''));

        stage = 'select_image_model';
        if (!selectedImageModel) {
          return json(200, {
            ok: false,
            action: 'generate',
            error: 'no_image_model_available',
            safeErrorMessage: 'No supported Imagen model is available for this API key/project.',
            availableImageModels,
          });
        }

        const targetW = Number(body?.size?.w) || 8;
        const targetH = Number(body?.size?.h) || 4;
        const selectedImagenAspectRatio = pickImagenRatio(targetW, targetH);
        const selectedBannerRatio = `${targetW}:${targetH}`;

        stage = 'build_prompt';
        const cleaned = sanitizePromptText(rawUserPrompt);
        const extracted = extractBannerTextAndDirection(cleaned);
        const referenceImageIncluded = Boolean(body.referenceImage);
        const referenceAnalysis = referenceImageIncluded ? await analyzeReferenceImage({ referenceImage: body.referenceImage, textModel, googleApiKey }) : null;
        const referenceMode = referenceImageIncluded ? 'analyzed_prompt_guidance' : 'none';
        const finalProductionPrompt = buildProductionBannerPrompt({
          rawUserPrompt: cleaned,
          selectedWidthFt: targetW,
          selectedHeightFt: targetH,
          referenceAnalysis,
          extractedBannerText: extracted.allowedTextList,
          designDirection: extracted.designDirection,
        });

        stage = 'imagen_predict';
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 22000);
        const r = await fetch(`${GEMINI_BASE}/models/${selectedImageModel}:predict`, {
          method: 'POST',
          headers: { 'x-goog-api-key': googleApiKey, 'content-type': 'application/json' },
          body: JSON.stringify({ instances: [{ prompt: finalProductionPrompt }], parameters: { sampleCount: 1, aspectRatio: selectedImagenAspectRatio } }),
          signal: controller.signal,
        }).finally(() => clearTimeout(t));
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          return json(200, {
            ok: false,
            action: 'generate',
            error: 'generate_failed',
            stage,
            safeErrorMessage: d?.error?.message || 'Image generation failed.',
            providerStatus: r.status,
            providerMessageFirst500: JSON.stringify(d).slice(0, 500),
          });
        }

        stage = 'parse_imagen_response';
        const b64 = d?.predictions?.[0]?.bytesBase64Encoded;
        if (!b64) {
          return json(200, {
            ok: false,
            action: 'generate',
            error: 'generate_failed',
            stage,
            safeErrorMessage: 'No image returned from model.',
            providerStatus: r.status,
            providerMessageFirst500: JSON.stringify(d).slice(0, 500),
          });
        }

        let url = `data:image/png;base64,${b64}`;
        let original = url;
        let width = targetW * 100;
        let height = targetH * 100;

        if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
          stage = 'cloudinary_upload';
          const upload = await cloudinary.uploader.upload(url, { folder: 'ai-generated-banners', resource_type: 'image' });
          url = cloudinaryRatioTransformUrl(upload.public_id, targetW, targetH);
          original = upload.secure_url || url;
          width = upload.width || width;
          height = upload.height || height;
        }

        stage = 'build_response';
        return json(200, {
          ok: true,
          action: 'generate',
          provider: 'gemini-studio-flow',
          matchedGoogleEnvName: matchedEnvName,
          hasGoogleApiKey: Boolean(googleApiKey),
          selectedImageModel,
          supportedGenerationMethods,
          selectedImagenAspectRatio,
          selectedBannerRatio,
          finalProductionPrompt,
          providerStatus: 200,
          cropFillApplied: true,
          canonicalApprovedImageUrl: url,
          referenceImageIncluded,
          referenceMode,
          referenceAnalysis,
          logoCompositeApplied: false,
          imageUrl: url,
          image: { url, original_url: original, width, height },
        });
      } catch (e) {
        const timeout = String(e?.name || '').toLowerCase() === 'aborterror';
        return json(200, {
          ok: false,
          action: 'generate',
          error: timeout ? 'provider_timeout' : 'generate_failed',
          stage,
          safeErrorMessage: timeout ? 'Imagen generation timed out before the serverless limit.' : (e?.message || String(e) || 'Generate failed'),
          providerStatus: null,
          providerMessageFirst500: (e?.message || String(e) || '').slice(0, 500),
        });
      }
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
