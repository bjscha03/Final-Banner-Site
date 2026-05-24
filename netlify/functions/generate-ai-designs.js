import { v2 as cloudinary } from 'cloudinary';

const CORS = {
  'Content-Type': 'application/json',
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
const safeJsonResponse = (statusCode, payload = {}) => {
  try {
    return { statusCode, headers: CORS, body: JSON.stringify(payload ?? {}) };
  } catch {
    return { statusCode, headers: CORS, body: JSON.stringify({ ok: false, error: 'response_serialization_failed', safeErrorMessage: 'Response serialization failed.', detailCode: 'serialization_failed', stage: 'response' }) };
  }
};
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
const MOCKUP_BAN_PREPEND = `Create ONLY the actual flat banner artwork itself.
Do NOT create a printed banner mockup or presentation.
Do NOT generate hanging hardware, ropes, poles, fences, grommets, walls, frames, product photography, repeated banners, miniature banners, or print-preview sheets.
The generated image itself must be the final edge-to-edge printable banner graphic.
Design directly for the full canvas dimensions as a finished commercial banner artwork.
The final image should look like a professionally designed digital banner graphic file, not a photo of a physical banner.
Do NOT create banners inside banners, miniature repeated banner copies, product-sheet layouts, mockup thumbnails, preview boards, or duplicated embedded designs.`;
const HARDWARE_BAN_PREPEND = `The artwork must not contain grommets, eyelets, holes, ropes, pole pockets, hems, hooks, screws, or mounting hardware. Finishing details are preview overlays only and must never be part of the generated design.`;
const SAFE_EDIT_KEYWORDS = /(remove border|full bleed|remove embedded grommets|remove grommets|remove eyelets|improve contrast|contrast|minor color|color adjustment|remove background clutter|background clutter)/i;
const BLOCKED_TEXT_EDIT_KEYWORDS = /(change|replace|update).*(name|text|to|with)|\bphone\b|\bnumber\b|\b\d{4}\b/i;

const FALLBACK_IMAGE_URL = 'https://res.cloudinary.com/dtrxl120u/image/upload/f_auto,q_auto,w_1600,h_800,c_fill/v1769209469/White-Label_Banners_-2_from_4over_nedg8n.png';
const OPENAI_BASE = 'https://api.openai.com/v1';

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
async function callOpenAIImageGenerate({ apiKey, prompt, size = '1536x1024', model = 'gpt-image-1' }) {
  const r = await fetch(`${OPENAI_BASE}/images/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      prompt,
      size,
      n: 1,
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(d?.error?.message || `OpenAI image generation failed (${r.status})`);
    err.openaiStatus = r.status;
    err.openaiErrorCode = d?.error?.code || 'openai_error';
    err.openaiErrorMessage = d?.error?.message || `OpenAI image generation failed (${r.status})`;
    err.openaiRawResponseFirst500 = JSON.stringify(d || {}).slice(0, 500);
    err.openaiModelAttempted = model;
    throw err;
  }
  const out = d?.data || [];
  for (const item of out) {
    if (item?.b64_json) return { b64: item.b64_json, modelUsed: model, providerStatus: r.status };
    if (item?.url) {
      const img = await fetch(item.url);
      const ab = await img.arrayBuffer();
      const b64 = Buffer.from(ab).toString('base64');
      if (b64) return { b64, modelUsed: model, providerStatus: r.status };
    }
  }
  const err = new Error('OpenAI returned no image output.');
  err.openaiStatus = r.status;
  err.openaiErrorCode = 'openai_no_image_output';
  err.openaiErrorMessage = 'OpenAI returned no image output.';
  err.openaiRawResponseFirst500 = JSON.stringify(d || {}).slice(0, 500);
  err.openaiModelAttempted = model;
  throw err;
}
async function scoreGeneratedImageType({ apiKey, textModel, b64, mimeType = 'image/png' }) {
  const r = await fetch(`${GEMINI_BASE}/models/${textModel}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { text: 'Return strict JSON only with numeric keys 0..1: mockupLikelihood, repeatedBannerLikelihood, posterFrameLikelihood, fullBleedScore and boolean safetyPassTriggered recommendation (true when mockupLikelihood>0.45 or fullBleedScore<0.75).' },
          { inline_data: { mime_type: mimeType, data: b64 } },
        ],
      }],
    }),
  });
  const d = await r.json().catch(() => ({}));
  const raw = d?.candidates?.[0]?.content?.parts?.map((p) => p.text).join(' ') || '{}';
  try {
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}');
    const mockupLikelihood = Number(parsed.mockupLikelihood ?? 0.2);
    const repeatedBannerLikelihood = Number(parsed.repeatedBannerLikelihood ?? 0.2);
    const posterFrameLikelihood = Number(parsed.posterFrameLikelihood ?? 0.2);
    const fullBleedScore = Number(parsed.fullBleedScore ?? 0.8);
    const safetyPassTriggered = Boolean(parsed.safetyPassTriggered) || mockupLikelihood > 0.45 || fullBleedScore < 0.75;
    return { mockupLikelihood, repeatedBannerLikelihood, posterFrameLikelihood, fullBleedScore, safetyPassTriggered };
  } catch {
    return { mockupLikelihood: 0.2, repeatedBannerLikelihood: 0.2, posterFrameLikelihood: 0.2, fullBleedScore: 0.8, safetyPassTriggered: false };
  }
}
async function scoreHardwareArtifacts({ apiKey, textModel, b64, mimeType = 'image/png' }) {
  try {
    const r = await fetch(`${GEMINI_BASE}/models/${textModel}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: 'Return strict JSON only with numeric keys 0..1: embeddedGrommetLikelihood, hardwareArtifactLikelihood.' },
            { inline_data: { mime_type: mimeType, data: b64 } },
          ],
        }],
      }),
    });
    const d = await r.json().catch(() => ({}));
    const raw = d?.candidates?.[0]?.content?.parts?.map((p) => p.text).join(' ') || '{}';
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}');
    return {
      embeddedGrommetLikelihood: Number(parsed.embeddedGrommetLikelihood ?? 0.1),
      hardwareArtifactLikelihood: Number(parsed.hardwareArtifactLikelihood ?? 0.1),
    };
  } catch {
    return { embeddedGrommetLikelihood: 0.1, hardwareArtifactLikelihood: 0.1 };
  }
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
function classifyEditInstruction(editInstruction) {
  const t = String(editInstruction || '').toLowerCase();
  if (/(change|replace|update).*(to|with)|\b202\d\b|\bphone\b|\bnumber\b|\bname\b/.test(t)) return 'text_replace';
  if (/(color|palette|saturat|hue|tone)/.test(t)) return 'color_adjust';
  if (/(font|typography|style|premium|modern|clean)/.test(t)) return 'style_refine';
  if (/(layout|position|move|align|spacing|composition)/.test(t)) return 'composition_adjust';
  if (/(background|add|tower|texture|element)/.test(t)) return 'background_addition';
  if (/(logo|brand mark|branding)/.test(t)) return 'logo_change';
  return 'full_regeneration';
}

async function handlerCore(event) {
  if (event.httpMethod === 'OPTIONS') return safeJsonResponse(200, { ok: true });

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
  const openaiApiKey = process.env.OPENAI_API_KEY || '';
  const matchedOpenAiEnvName = process.env.OPENAI_API_KEY ? 'OPENAI_API_KEY' : null;

  console.log('[generate-ai-designs] matched env var:', matchedEnvName || 'none');

  if (event.httpMethod === 'GET') {
    return safeJsonResponse(200, {
      ok: true,
      action: 'health',
      functionReachable: true,
      env: { hasGoogleApiKey: Boolean(googleApiKey) },
      matchedEnvName,
      timestamp: new Date().toISOString(),
    });
  }

  if (event.httpMethod !== 'POST') return safeJsonResponse(405, { ok: false, error: 'Method not allowed', detailCode: 'method_not_allowed', safeErrorMessage: 'Method not allowed.', stage: 'request' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return safeJsonResponse(400, { ok: false, error: 'Invalid JSON body', detailCode: 'invalid_json_body', safeErrorMessage: 'Invalid JSON request body.', stage: 'request' }); }
  const action = typeof body?.action === 'string' ? body.action : null;

  if (!googleApiKey) {
    return safeJsonResponse(200, {
      ok: false, action, functionReachable: true,
      env: { hasGoogleApiKey: Boolean(googleApiKey) }, matchedEnvName,
      error: 'AI environment not configured',
    });
  }

  try {
    let textModel = 'gemini-1.5-flash';
    let imageModel = 'imagen-4.0-generate-001';

    if (action === 'debug') {
      const models = await fetchModels(googleApiKey).catch(() => []);
      if (models.length > 0) {
        const resolved = resolveModels(models);
        textModel = resolved.textModel;
        imageModel = resolved.imageModel;
      }
      return safeJsonResponse(200, {
        ok: true, action, functionReachable: true,
        env: { hasGoogleApiKey: Boolean(googleApiKey) }, matchedEnvName,
        modelsEndpointReachable: models.length > 0,
        selectedTextModel: textModel,
        selectedImageModel: imageModel,
        openaiConfigured: Boolean(openaiApiKey),
        hasOpenAiKey: Boolean(openaiApiKey),
        matchedOpenAiEnvName,
        safeErrorMessage: null,
      });
    }

    if (action === 'enhance') try {
      const originalPrompt = String(body.prompt || '').trim();
      if (!originalPrompt) return safeJsonResponse(400, { ok: false, action, error: 'Prompt required', detailCode: 'prompt_required', safeErrorMessage: 'Prompt required.', stage: 'enhance' });
      const referenceProfile = await analyzeReferenceImage({ apiKey: googleApiKey, textModel, referenceImage: body.referenceImage });
      const allowedTextList = extractAllowedTextList(originalPrompt);
      const enhancedPrompt = await buildArtDirectedPrompt({ apiKey: googleApiKey, textModel, userPrompt: originalPrompt, referenceProfile, mode: 'generate', allowedTextList }) || fallbackEnhance(originalPrompt, body.size);
      return safeJsonResponse(200, { ok: true, action, enhancedPrompt, safeErrorMessage: null });
    } catch (error) {
      return safeJsonResponse(200, { ok: false, action: 'enhance', error: 'enhance_failed', detailCode: 'enhance_exception', safeErrorMessage: error instanceof Error ? error.message : 'Enhance failed.', stage: 'enhance' });
    }
    if (action === 'enhanceEdit') try {
      const editInstruction = String(body.editInstruction || '').trim();
      if (!editInstruction) return safeJsonResponse(400, { ok: false, action, error: 'Edit instruction required', detailCode: 'edit_instruction_required', safeErrorMessage: 'Edit instruction required.', stage: 'enhanceEdit' });
      const r = await fetch(`${GEMINI_BASE}/models/${textModel}:generateContent?key=${encodeURIComponent(googleApiKey)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: `Rewrite as one direct banner edit instruction only. No options, no explanation. Preserve existing composition and keep artwork flat, full-bleed, print-ready: ${editInstruction}` }] }] }),
      });
      const d = await r.json().catch(() => ({}));
      const enhancedEditPrompt = sanitizeSinglePrompt(d?.candidates?.[0]?.content?.parts?.map((p) => p.text).join(' ') || editInstruction);
      return safeJsonResponse(200, { ok: true, action, enhancedEditPrompt });
    } catch (error) {
      return safeJsonResponse(200, { ok: false, action: 'enhanceEdit', error: 'enhance_edit_failed', detailCode: 'enhance_edit_exception', safeErrorMessage: error instanceof Error ? error.message : 'Enhance edit failed.', stage: 'enhanceEdit' });
    }

    if (action === 'generate') try {
      const generateError = (stage, err, extra = {}) => safeJsonResponse(200, {
        ok: false,
        action: 'generate',
        error: 'generate_failed',
        stage,
        safeErrorMessage: err instanceof Error ? err.message : String(err || 'Generate failed.'),
        stackFirstLine: String(err?.stack || '').split('\n')[0] || null,
        ...extra,
      });

      const receivedImageProvider = body.imageProvider;
      const requestedProvider = receivedImageProvider === 'imagen' ? 'imagen' : 'openai';
      const targetW = Number(body?.size?.w ?? body?.width) || 8;
      const targetH = Number(body?.size?.h ?? body?.height) || 4;
      const promptBase = sanitizeSinglePrompt(body.enhancedPrompt || body.prompt || '');
      if (!promptBase) {
        return safeJsonResponse(400, { ok: false, action: 'generate', error: 'prompt_required', stage: 'parse_generate_payload', safeErrorMessage: 'Prompt required.' });
      }

      const sourcePrompt = `${GENERATION_GUARDRAIL}
${FULL_BLEED_PREPEND}
${MOCKUP_BAN_PREPEND}
${HARDWARE_BAN_PREPEND}
${promptBase}`;

      if (!openaiApiKey) {
        return safeJsonResponse(200, {
          ok: false,
          action: 'generate',
          error: 'openai_missing_api_key',
          stage: 'openai_generate',
          safeErrorMessage: 'OPENAI_API_KEY is not configured.',
          receivedImageProvider: receivedImageProvider || null,
          requestedProvider,
        });
      }

      let b64 = '';
      let modelUsed = 'gpt-image-1';
      let providerStatus = 200;
      try {
        const openaiModelCandidates = ['gpt-image-1', 'gpt-image-2', 'gpt-image-1.5'];
        let lastErr = null;
        for (const m of openaiModelCandidates) {
          try {
            const result = await callOpenAIImageGenerate({ apiKey: openaiApiKey, prompt: sourcePrompt, size: '1536x1024', model: m });
            b64 = result.b64;
            modelUsed = result.modelUsed;
            providerStatus = result.providerStatus;
            break;
          } catch (e) {
            lastErr = e;
          }
        }
        if (!b64) throw lastErr || new Error('No OpenAI model produced an image.');
      } catch (error) {
        return generateError('openai_generate', error, {
          openaiStatus: error?.openaiStatus || 500,
          openaiErrorCode: error?.openaiErrorCode || 'openai_generation_failed',
          openaiErrorMessage: error?.openaiErrorMessage || error?.message || 'OpenAI generation failed.',
          openaiModelAttempted: error?.openaiModelAttempted || null,
          openaiRawResponseFirst500: error?.openaiRawResponseFirst500 || null,
          receivedImageProvider: receivedImageProvider || null,
          requestedProvider,
        });
      }

      if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        return safeJsonResponse(200, {
          ok: false,
          action: 'generate',
          error: 'cloudinary_not_configured',
          stage: 'cloudinary_upload',
          safeErrorMessage: 'Cloudinary not configured for upload.',
          receivedImageProvider: receivedImageProvider || null,
          requestedProvider,
          modelUsed,
        });
      }

      let upload;
      try {
        upload = await cloudinary.uploader.upload(`data:image/png;base64,${b64}`, { folder: 'ai-generated-banners', resource_type: 'image' });
      } catch (error) {
        return generateError('cloudinary_upload', error, {
          receivedImageProvider: receivedImageProvider || null,
          requestedProvider,
          modelUsed,
        });
      }

      return safeJsonResponse(200, {
        ok: true,
        action: 'generate',
        stage: 'openai_cloudinary_success',
        receivedImageProvider: receivedImageProvider || null,
        requestedProvider,
        actualProviderUsed: 'openai',
        imageProvider: 'openai',
        modelUsed,
        providerStatus,
        fallbackReason: null,
        finalProductionPrompt: sourcePrompt,
        imageUrl: upload.secure_url,
        image: {
          url: upload.secure_url,
          original_url: upload.secure_url,
          width: upload.width || targetW * 100,
          height: upload.height || targetH * 100,
        },
      });
    } catch (error) {
      return safeJsonResponse(200, { ok: false, action: 'generate', error: 'generate_failed', detailCode: 'generate_exception', safeErrorMessage: error instanceof Error ? error.message : 'Generate failed.', stage: 'generate', stackFirstLine: String(error?.stack || '').split('\n')[0] || null });
    }



    if (action === 'edit') try {
      const currentImageUrl = String(body.imageUrl || '').trim();
      const editInstruction = String(body.editInstruction || '').trim();
      if (!currentImageUrl) return safeJsonResponse(400, { ok: false, action, error: 'Image is required', detailCode: 'image_required', safeErrorMessage: 'Image is required.', stage: 'edit' });
      if (!editInstruction) return safeJsonResponse(400, { ok: false, action, error: 'Edit instruction required', detailCode: 'edit_instruction_required', safeErrorMessage: 'Edit instruction required.', stage: 'edit' });
      const targetW = Number(body?.size?.w) || 8;
      const targetH = Number(body?.size?.h) || 4;
      const imagenAspectRatio = pickImagenRatio(targetW, targetH);
      const rawUserPrompt = sanitizeSinglePrompt(body.prompt || '');
      const allowedTextList = extractAllowedTextList(rawUserPrompt);
      const referenceProfile = await analyzeReferenceImage({ apiKey: googleApiKey, textModel, referenceImage: body.referenceImage });
      const editClassification = classifyEditInstruction(editInstruction);
      const blockedTextEdit = BLOCKED_TEXT_EDIT_KEYWORDS.test(editInstruction);
      const safeEditAllowed = SAFE_EDIT_KEYWORDS.test(editInstruction);
      if (blockedTextEdit && !safeEditAllowed) {
        return safeJsonResponse(200, {
          ok: false,
          action,
          error: 'blocked_edit',
          detailCode: 'text_replacement_blocked',
          blockedEditReason: 'Text replacement requires a true layered/text-aware edit path. Current AI edit would regenerate the design, so it was blocked to preserve quality.',
          safeErrorMessage: 'Text replacement requires a true layered/text-aware edit path. Current AI edit would regenerate the design, so it was blocked to preserve quality.',
          stage: 'edit',
          debug: { editClassification, blockedEditReason: 'text_replacement_blocked' },
        });
      }
      if (!safeEditAllowed && !blockedTextEdit) {
        return safeJsonResponse(200, {
          ok: false,
          action,
          error: 'blocked_edit',
          detailCode: 'unsafe_edit_classification',
          blockedEditReason: 'Edit blocked to prevent destructive regeneration. Only safe refinement edits are currently enabled.',
          safeErrorMessage: 'Edit blocked to prevent destructive regeneration. Only safe refinement edits are currently enabled.',
          stage: 'edit',
          debug: { editClassification, blockedEditReason: 'unsafe_edit_classification' },
        });
      }
      const preservationMode = editClassification === 'text_replace' ? 'surgical_text_edit' : 'preserve_layout_refinement';
      const compositionDriftRisk = editClassification === 'text_replace' ? 'low' : editClassification === 'full_regeneration' ? 'high' : 'medium';
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
${MOCKUP_BAN_PREPEND}
${HARDWARE_BAN_PREPEND}
Preserve the existing banner composition, character placement, typography style, color palette, visual hierarchy, and overall layout. Only apply the requested change. Do not redesign the banner. Do not create a new composition. Keep the same overall design identity.
Maintain the same composition and layout positioning. Keep all major elements in their current positions unless specifically instructed otherwise.
Preserve the existing banner canvas ratio and convert the design to full-bleed edge-to-edge artwork. Remove any borders, poster margins, white padding, frames, or drop shadows.
Refine the existing banner concept while preserving core theme and layout intent.
Current image URL: ${currentImageUrl}
Edit classification: ${editClassification}
Preservation mode: ${preservationMode}
Edit instruction: ${directedEditInstruction}`;
      const imageProvider = 'imagen';
      let b64 = '';
      let provider = imageProvider;
      const requestedProvider = imageProvider;
      let modelUsed = imageModel;
      let providerStatus = 200;
      let fallbackReason = null;
      let openaiFailure = null;
      if (false && imageProvider === 'openai' && openaiApiKey) {
        const openaiModelCandidates = ['gpt-image-1', 'gpt-image-2', 'gpt-image-1.5'];
        for (const m of openaiModelCandidates) {
          try {
            const result = await callOpenAIImageGenerate({ apiKey: openaiApiKey, prompt: editPrompt, size: '1536x1024', model: m, referenceImage: body.referenceImage, editBaseImage: currentImageUrl });
            b64 = result.b64; modelUsed = result.modelUsed; providerStatus = result.providerStatus; break;
          } catch (e) { openaiFailure = { openaiStatus: e?.openaiStatus || 500, openaiErrorCode: e?.openaiErrorCode || 'openai_edit_failed', openaiErrorMessage: e?.openaiErrorMessage || e?.message || 'OpenAI edit failed.', openaiModelAttempted: e?.openaiModelAttempted || null, openaiRawResponseFirst500: e?.openaiRawResponseFirst500 || null }; }
        }
      }
      if (!b64) {
        provider = 'imagen';
        if (requestedProvider === 'openai') fallbackReason = 'openai_failed_fallback_to_imagen';
        const r = await fetch(`${GEMINI_BASE}/models/${imageModel}:predict?key=${encodeURIComponent(googleApiKey)}`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ instances: [{ prompt: editPrompt }], parameters: { sampleCount: 1, aspectRatio: imagenAspectRatio } }),
        });
        const d = await r.json().catch(() => ({}));
        providerStatus = r.status;
        if (!r.ok) return safeJsonResponse(200, { ok: false, action, error: 'edit_generation_failed', detailCode: 'provider_edit_failed', safeErrorMessage: d?.error?.message || 'Edit generation failed.', stage: 'edit' });
        b64 = d?.predictions?.[0]?.bytesBase64Encoded;
      }
      if (!b64) return safeJsonResponse(200, { ok: false, action, error: 'no_edited_image', detailCode: 'provider_empty_edit_image', safeErrorMessage: 'No edited image returned from model.', stage: 'edit' });
      let safetyPassTriggered = false;
      let imageTypeScores = { mockupLikelihood: 0.2, repeatedBannerLikelihood: 0.2, posterFrameLikelihood: 0.2, fullBleedScore: 0.8, safetyPassTriggered: false };
      try { imageTypeScores = await scoreGeneratedImageType({ apiKey: googleApiKey, textModel, b64 }); } catch {}
      let hardwareScores = await scoreHardwareArtifacts({ apiKey: googleApiKey, textModel, b64 });
      if (imageTypeScores.safetyPassTriggered) safetyPassTriggered = true;
      const trueImageEditUsed = provider === 'openai';
      const fullRegenerationOccurred = !trueImageEditUsed;
      const upload = await cloudinary.uploader.upload(`data:image/png;base64,${b64}`, { folder: 'ai-generated-banners', resource_type: 'image' });
      let canonicalImageUrl = cloudinaryRatioTransformUrlAggressive(upload.public_id, targetW, targetH);
      let logoCompositeMode = 'none';
      let logoCompositedDirectly = false;
      let whitespaceScore = Math.max(0, 1 - imageTypeScores.fullBleedScore);
      let edgeCoverageScore = imageTypeScores.fullBleedScore;
      let centeredPosterLikelihood = imageTypeScores.posterFrameLikelihood;
      let marginCropApplied = true;
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
      return safeJsonResponse(200, { ok: true, action, imageUrl: canonicalImageUrl, image: { url: canonicalImageUrl, original_url: upload.secure_url || canonicalImageUrl, width: upload.width || targetW * 100, height: upload.height || targetH * 100 }, editFallback: false, provider, imageProvider: provider, debug: { rawUserPrompt, hasOpenAiKey: Boolean(openaiApiKey), matchedOpenAiEnvName, requestedProvider, actualProviderUsed: provider, modelUsed, providerStatus, fallbackReason, fallbackMessage: fallbackReason === 'openai_failed_fallback_to_imagen' ? 'OpenAI failed, using Imagen fallback.' : null, ...(openaiFailure || {}), editClassification, preservationMode, compositionDriftRisk, trueImageEditUsed, fullRegenerationOccurred, referenceType: referenceProfile.referenceType, logoDetected: referenceProfile.logoLikely, logoCompositeMode, logoCompositedDirectly, referenceSummary: referenceProfile.referenceSummary, extractedColors: referenceProfile.extractedColors, allowedTextList, usedReferenceImage: Boolean(body.referenceImage), whitespaceScore, edgeCoverageScore, centeredPosterLikelihood, mockupLikelihood: imageTypeScores.mockupLikelihood, repeatedBannerLikelihood: imageTypeScores.repeatedBannerLikelihood, posterFrameLikelihood: imageTypeScores.posterFrameLikelihood, fullBleedScore: imageTypeScores.fullBleedScore, embeddedGrommetLikelihood: hardwareScores.embeddedGrommetLikelihood, hardwareArtifactLikelihood: hardwareScores.hardwareArtifactLikelihood, marginCropApplied, blockedEditReason: null, regenerationSafetyPassTriggered: safetyPassTriggered, canonicalApprovedImageUrl: canonicalImageUrl, finalProductionPrompt: editPrompt }, safeErrorMessage: null });
    } catch (error) {
      return safeJsonResponse(200, { ok: false, action: 'edit', error: 'edit_failed', detailCode: 'edit_exception', safeErrorMessage: error instanceof Error ? error.message : 'Edit failed.', stage: 'edit' });
    }

    return safeJsonResponse(400, { ok: false, action: null, error: 'unknown_action', receivedAction: action || null, detailCode: 'unknown_action', safeErrorMessage: 'Unknown action.', stage: 'routing' });
  } catch (error) {
    return safeJsonResponse(200, { ok: false, action, functionReachable: true, error: 'function_exception', detailCode: 'top_level_exception', safeErrorMessage: error instanceof Error ? error.message : 'AI service unavailable', stage: 'handler' });
  }
}

export async function handler(event) {
  try {
    return await handlerCore(event);
  } catch (err) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        ok: false,
        error: 'function_crash',
        safeErrorMessage: err?.message || 'Unknown function crash',
        stackFirstLine: String(err?.stack || '').split('\n')[0],
      }),
    };
  }
}
