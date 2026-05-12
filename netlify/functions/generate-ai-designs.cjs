const OpenAI = require('openai');
const cloudinary = require('cloudinary').v2;
const { neon } = require('@neondatabase/serverless');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const SUPPORTED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const TARGET_PREVIEW_LONG_EDGE_PX = 2400;

function normalizeTargetDimensions(widthIn, heightIn) {
  const w = Number(widthIn);
  const h = Number(heightIn);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return { widthPx: 2048, heightPx: 1024 };
  }
  const ratio = w / h;
  if (ratio >= 1) {
    return { widthPx: TARGET_PREVIEW_LONG_EDGE_PX, heightPx: Math.max(512, Math.round(TARGET_PREVIEW_LONG_EDGE_PX / ratio)) };
  }
  return { widthPx: Math.max(512, Math.round(TARGET_PREVIEW_LONG_EDGE_PX * ratio)), heightPx: TARGET_PREVIEW_LONG_EDGE_PX };
}

function enhancePrompt({ prompt, size, inspirationImage, brandMatchStrength = 'strong', styleChips = [] }) {
  const aspect = size?.wIn && size?.hIn ? `${size.wIn}:${size.hIn}` : '';
  const strengthLine = brandMatchStrength === 'light' ? 'Lightly reference uploaded branding.' : brandMatchStrength === 'medium' ? 'Follow uploaded branding with moderate strength.' : 'Closely follow the uploaded branding reference.';
  const styles = Array.isArray(styleChips) && styleChips.length ? `Style direction: ${styleChips.join(', ')}.` : '';
  return `You are a premium AI creative director producing ONE custom final banner artwork.
Generate ONLY one flat print-ready composition.
NEVER generate mockups, grommets, hems, folds, wall scenes, perspective views, presentation boards, multiple concepts, clipart, seasonal filler templates, or generic Canva-style layouts.
Use bold readable typography, premium hierarchy, high contrast, safe margins, edge-to-edge composition, and exact selected aspect ratio for large-format print readability.
${strengthLine}
Use uploaded brand colors, tone, iconography, visual energy, and typography cues as primary influence.
${styles}
${inspirationImage ? 'An inspiration image is attached; treat it as the main visual reference for brand matching.' : ''}
${aspect ? `Use exact aspect ratio ${aspect}.` : ''}

User request:
${prompt}`;
}

function parseInspirationImage(inspirationImage) {
  if (!inspirationImage) return { imageDetected: false, includedInApiRequest: false, byteSize: 0, mimeType: null, base64Data: null };
  const match = String(inspirationImage).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    const e = new Error('Invalid image payload format. Expected data URL base64 image.');
    e.code = 'INVALID_IMAGE_PAYLOAD';
    throw e;
  }
  const mimeType = match[1].toLowerCase();
  const base64Data = match[2];
  if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
    const e = new Error(`Unsupported mime type: ${mimeType}`);
    e.code = 'UNSUPPORTED_MIME_TYPE';
    throw e;
  }
  let byteSize = 0;
  try {
    byteSize = Buffer.from(base64Data, 'base64').length;
  } catch (_) {
    const e = new Error('Bad base64 conversion for inspiration image');
    e.code = 'BAD_BASE64';
    throw e;
  }
  return { imageDetected: true, includedInApiRequest: true, byteSize, mimeType, base64Data };
}

function toAdminSafeError(error) {
  const message = String(error?.message || '').toLowerCase();
  const status = error?.status;
  if (error?.code === 'INVALID_IMAGE_PAYLOAD') return 'invalid image payload';
  if (error?.code === 'UNSUPPORTED_MIME_TYPE') return 'unsupported mime type';
  if (error?.code === 'BAD_BASE64') return 'bad base64 conversion';
  if (error?.code === 'NO_IMAGE_FROM_OPENAI') return 'OpenAI returned no image';
  if (error?.code === 'MALFORMED_RESPONSE') return 'malformed response';
  if (error?.code === 'CLOUDINARY_UPLOAD_FAILED') return 'Cloudinary upload failed';
  if (status === 401 || message.includes('api key') || message.includes('authentication')) return 'OpenAI API key invalid';
  if (status === 429 && (message.includes('quota') || message.includes('billing') || message.includes('rate limit'))) return 'OpenAI billing limit reached';
  if (message.includes('unsupported image') || message.includes('invalid image') || message.includes('image format')) return 'OpenAI image input format invalid';
  if (status === 404 || message.includes('model') && message.includes('not')) return 'OpenAI model not available';
  if (message.includes('timeout') || message.includes('timed out') || error?.code === 'ETIMEDOUT') return 'timeout';
  if (message.includes('function timed out')) return 'function timed out';
  return 'AI design generation failed';
}

function extractOpenAIError(error) {
  const rawBody = error?.response?.data || error?.error || error?.body || error?.cause || null;
  return {
    status: error?.status || error?.response?.status || null,
    code: error?.code || error?.response?.data?.error?.code || null,
    type: error?.type || error?.response?.data?.error?.type || null,
    message: error?.message || error?.response?.data?.error?.message || 'Unknown OpenAI error',
    rawBody
  };
}

async function assertAdminAccess(userEmail) {
  if (!userEmail) return false;
  const dbUrl = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
  if (!dbUrl) return false;
  const sql = neon(dbUrl);
  const columns = await sql`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles'`;
  const available = new Set(columns.map((c) => c.column_name));
  if (available.has('is_admin')) return (await sql`SELECT is_admin FROM profiles WHERE email = ${userEmail} LIMIT 1`)[0]?.is_admin === true;
  if (available.has('role')) return String((await sql`SELECT role FROM profiles WHERE email = ${userEmail} LIMIT 1`)[0]?.role || '').toLowerCase() === 'admin';
  if (available.has('user_role')) return String((await sql`SELECT user_role FROM profiles WHERE email = ${userEmail} LIMIT 1`)[0]?.user_role || '').toLowerCase() === 'admin';
  if (available.has('account_type')) return String((await sql`SELECT account_type FROM profiles WHERE email = ${userEmail} LIMIT 1`)[0]?.account_type || '').toLowerCase() === 'admin';
  return false;
}

const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_IMAGE_TIMEOUT_MS || 25000);

exports.handler = async (event) => {
  const fnStart = Date.now();
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.queryStringParameters?.debugPing === 'true') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Function reached',
        timestamp: new Date().toISOString(),
        env: {
          hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
          hasCloudinary: Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
        }
      })
    };
  }

  const isProduction = process.env.CONTEXT === 'production' || process.env.NODE_ENV === 'production';
  const debug = { success: false, stepFailed: null, durationMs: 0, model: 'gpt-image-1', openaiStatus: null, cloudinaryStatus: null, imageDetected: false, inspirationIncluded: false, fallbackAttempted: false, fallbackSucceeded: false, error: null, errorMessage: null, openaiError: null, cloudinaryError: null };

  const buildResponse = (statusCode, extra = {}) => ({
    statusCode,
    headers,
    body: JSON.stringify({
      success: debug.success,
      stepFailed: debug.stepFailed,
      durationMs: debug.durationMs,
      model: debug.model,
      imageDetected: debug.imageDetected,
      inspirationIncluded: debug.inspirationIncluded,
      openaiStatus: debug.openaiStatus,
      cloudinaryStatus: debug.cloudinaryStatus,
      fallbackAttempted: debug.fallbackAttempted,
      fallbackSucceeded: debug.fallbackSucceeded,
      errorMessage: debug.errorMessage,
      openaiError: debug.openaiError,
      cloudinaryError: debug.cloudinaryError,
      ...extra
    })
  });

  if (event.httpMethod !== 'POST') {
    debug.durationMs = Date.now() - fnStart;
    debug.stepFailed = 'request_validation';
    return buildResponse(405, { error: { category: 'request_validation', message: 'Method not allowed' } });
  }

  try {
    console.log('[AI-Gen] request received', { at: new Date().toISOString() });
    const body = JSON.parse(event.body || '{}');
    const { prompt, size, userEmail, productType, width, height, inspirationImage, brandMatchStrength, styleChips, fastMode } = body;

    if (!prompt || !prompt.trim()) {
      debug.durationMs = Date.now() - fnStart;
      debug.stepFailed = 'request_validation';
      return buildResponse(400, { error: { category: 'request_validation', message: 'Prompt is required' } });
    }
    if (!size?.wIn || !size?.hIn) {
      debug.durationMs = Date.now() - fnStart;
      debug.stepFailed = 'request_validation';
      return buildResponse(400, { error: { category: 'request_validation', message: 'Size with wIn and hIn is required' } });
    }
    if (!process.env.OPENAI_API_KEY) {
      debug.durationMs = Date.now() - fnStart;
      debug.stepFailed = 'openai_request';
      return buildResponse(500, { error: { category: 'openai_request', message: 'OpenAI API key not configured' } });
    }
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      debug.durationMs = Date.now() - fnStart;
      debug.stepFailed = 'cloudinary_upload';
      return buildResponse(500, { error: { category: 'cloudinary_upload', message: 'Cloudinary not configured' } });
    }

    const isFastMode = fastMode === true || event.queryStringParameters?.fastMode === 'true';
    const isAdmin = userEmail ? await assertAdminAccess(userEmail) : false;
    if (isProduction && !isAdmin) {
      debug.durationMs = Date.now() - fnStart;
      debug.stepFailed = 'authorization';
      return buildResponse(403, { error: { category: 'authorization', message: 'Admin access required in production' } });
    }

    const promptText = enhancePrompt({ prompt: `${prompt.trim()}

Professional large-format ${productType || 'banner'} for ${width || size.wIn}x${height || size.hIn}.`, size, inspirationImage, brandMatchStrength, styleChips });
    const dalleSize = '1024x1024';
    const parsedImage = isFastMode
      ? { imageDetected: false, includedInApiRequest: false, byteSize: 0, mimeType: null, base64Data: null }
      : parseInspirationImage(inspirationImage);
    debug.imageDetected = parsedImage.imageDetected;
    debug.inspirationIncluded = parsedImage.includedInApiRequest;

    console.log('[AI-Gen] prompt', { prompt });
    console.log('[AI-Gen] enhanced prompt', { promptText });
    console.log('[AI-Gen] inspiration image', { detected: parsedImage.imageDetected, byteSize: parsedImage.byteSize, mimeType: parsedImage.mimeType, includedInApiRequest: parsedImage.includedInApiRequest });
    console.log('[AI-Gen] selected model', { model: debug.model, imageSize: dalleSize, mimeType: parsedImage.mimeType });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log('[AI-Gen] OpenAI config', {
      hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
      model: debug.model,
      imageInputIncluded: parsedImage.includedInApiRequest
    });

    const openaiPayload = { model: debug.model, prompt: promptText, n: 1, size: dalleSize };
    const openaiEditPayload = parsedImage.includedInApiRequest
      ? { model: debug.model, image: inspirationImage, prompt: promptText, n: 1, size: dalleSize }
      : null;

    console.log('[AI-Gen] OpenAI request start', {
      at: new Date().toISOString(),
      endpoint: openaiEditPayload ? 'images.edit' : 'images.generate',
      requestPayloadKeys: Object.keys(openaiEditPayload || openaiPayload)
    });
    const openaiStart = Date.now();
    let response;
    const openaiController = new AbortController();
    const openaiTimer = setTimeout(() => openaiController.abort(), OPENAI_TIMEOUT_MS);
    try {
      response = openaiEditPayload
        ? await openai.images.edit({ ...openaiEditPayload, signal: openaiController.signal })
        : await openai.images.generate({ ...openaiPayload, signal: openaiController.signal });
    } catch (primaryErr) {
      const primaryDetails = extractOpenAIError(primaryErr);
      debug.openaiError = primaryDetails;
      console.error('[AI-Gen] OpenAI exact error response', primaryDetails);
      if (openaiEditPayload) {
        console.log('[AI-Gen] Retrying OpenAI with TEXT-ONLY fallback mode');
        debug.fallbackAttempted = true;
        response = await openai.images.generate({ ...openaiPayload, signal: openaiController.signal });
        debug.fallbackSucceeded = true;
        debug.inspirationIncluded = false;
      } else {
        throw primaryErr;
      }
    } finally {
      clearTimeout(openaiTimer);
    }
    const openaiMs = Date.now() - openaiStart;
    debug.openaiStatus = 'ok';
    console.log('[AI-Gen] OpenAI response received', { at: new Date().toISOString(), openaiRequestMs: openaiMs });

    const image = response?.data?.[0] || {};
    const imageSource = image.url || (image.b64_json ? `data:image/png;base64,${image.b64_json}` : null);
    if (!response?.data) {
      const e = new Error('Malformed OpenAI response'); e.code = 'MALFORMED_RESPONSE'; throw e;
    }
    if (!imageSource) {
      const e = new Error('OpenAI returned no image'); e.code = 'NO_IMAGE_FROM_OPENAI'; throw e;
    }

    if (isFastMode) {
      const totalMs = Date.now() - fnStart;
      debug.success = true;
      debug.durationMs = totalMs;
      console.log('[AI-Gen] total function ms', { totalFunctionMs: totalMs, openaiRequestMs: openaiMs, fastMode: true });
      return buildResponse(200, {
        success: true,
        image: { url: image.url || null, base64: image.b64_json || null },
        metadata: { model: debug.model, count: 1, fastMode: true, skippedCloudinary: true }
      });
    }

    console.log('[AI-Gen] Cloudinary upload start', { at: new Date().toISOString() });
    const cloudStart = Date.now();
    let uploaded;
    try {
      uploaded = await cloudinary.uploader.upload(imageSource, { folder: 'ai-generated-banners', public_id: `banner-${Date.now()}`, resource_type: 'image', timeout: 45000 });
    } catch (uploadErr) {
      uploadErr.code = 'CLOUDINARY_UPLOAD_FAILED';
      debug.cloudinaryError = { message: uploadErr?.message || 'Cloudinary upload failed', code: uploadErr?.code || null, http_code: uploadErr?.http_code || null };
      throw uploadErr;
    }
    const cloudinaryMs = Date.now() - cloudStart;
    debug.cloudinaryStatus = 'ok';
    console.log('[AI-Gen] Cloudinary upload end', { at: new Date().toISOString(), cloudinaryUploadMs: cloudinaryMs });
    // Normalize to exact requested dimensions ratio from a single canonical source.
    const normalizedDims = normalizeTargetDimensions(width || size?.wIn, height || size?.hIn);
    const correctedUrl = cloudinary.url(uploaded.public_id, {
      secure: true,
      resource_type: 'image',
      type: 'upload',
      transformation: [
        {
          width: normalizedDims.widthPx,
          height: normalizedDims.heightPx,
          crop: 'fill',
          gravity: 'auto',
          fetch_format: 'auto',
          quality: 'auto:best',
          dpr: 'auto',
        },
      ],
    });
    console.log('[AI-Gen] final image URL', { url: correctedUrl, normalizedDims });

    const totalMs = Date.now() - fnStart;
    debug.success = true;
    debug.durationMs = totalMs;
    console.log('[AI-Gen] total function ms', { totalFunctionMs: totalMs, openaiRequestMs: openaiMs, cloudinaryUploadMs: cloudinaryMs });

    return buildResponse(200, {
      success: true,
      image: {
        url: correctedUrl,
        original_url: uploaded.secure_url,
        cloudinary_public_id: uploaded.public_id,
        width: normalizedDims.widthPx,
        height: normalizedDims.heightPx,
      },
      prompt: promptText,
      metadata: { model: debug.model, count: 1 },
      debug: isProduction ? undefined : debug
    });
  } catch (error) {
    const totalMs = Date.now() - fnStart;
    debug.durationMs = totalMs;
    debug.stepFailed = debug.cloudinaryStatus ? 'cloudinary_upload' : (debug.openaiStatus ? 'response_handling' : 'openai_request');
    debug.error = toAdminSafeError(error);
    debug.errorMessage = error?.message || debug.error || 'Unknown failure';
    if (!debug.openaiError) debug.openaiError = extractOpenAIError(error);
    console.error('[AI-Gen] Full failure object', error);
    console.error('[AI-Gen] OpenAI exact error response', debug.openaiError);
    console.error('[AI-Gen] Full stack trace', error?.stack || 'No stack');
    console.log('[AI-Gen] total function ms', { totalFunctionMs: totalMs });

    const safeError = isProduction ? (debug.error || 'AI design generation is temporarily unavailable. Please try again.') : debug.error;
    return buildResponse(500, {
      error: {
        category: debug.stepFailed || 'unknown',
        message: safeError,
        status: debug.openaiError?.status || null,
        code: debug.openaiError?.code || null,
        type: debug.openaiError?.type || null,
        details: debug.openaiError?.message || null,
        raw: debug.openaiError?.rawBody || null
      },
      debug: isProduction ? undefined : debug
    });
  }
};
