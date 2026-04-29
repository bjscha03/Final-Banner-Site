// netlify/functions/generate-design.cjs
//
// "Create with AI" backend: generates a print-ready design image for the
// existing Banner / Yard Sign / Car Magnet products using Google Imagen
// (Vertex AI), then crops it to the EXACT product aspect ratio so the
// frontend can drop it into the existing canvas / upload pipeline without
// any stretching or distortion.
//
// Inputs (POST JSON):
//   {
//     productType: "banner" | "yard_sign" | "car_magnet",
//     width:  number (inches),
//     height: number (inches),
//     material: string,
//     prompt: string (max 500 chars)
//   }
//
// Output:
//   { imageBase64, mimeType, width, height, aspectRatio, prompt }
//
// Env vars (server-side only — never exposed to the browser):
//   GOOGLE_CLOUD_PROJECT_ID                Required. GCP project id.
//   GOOGLE_APPLICATION_CREDENTIALS_JSON    Service-account JSON (raw or base64).
//                                          On Netlify this is the recommended way.
//   GOOGLE_APPLICATION_CREDENTIALS         Optional. Path to a SA JSON file
//                                          (used when running locally).
//   VERTEX_AI_LOCATION                     Optional. Defaults to "us-central1".
//   VERTEX_AI_IMAGEN_MODEL                 Optional. Defaults to "imagegeneration@006".

const { GoogleAuth } = require('google-auth-library');
const sharp = require('sharp');

const ALLOWED_PRODUCT_TYPES = new Set(['banner', 'yard_sign', 'car_magnet']);
const MAX_PROMPT_LENGTH = 500;

// Imagen only supports a fixed set of aspect ratios. We pick the closest one
// to the product's true ratio, then center-crop to the exact ratio with sharp.
const IMAGEN_ASPECT_RATIOS = [
  { value: '1:1',  ratio: 1 / 1 },
  { value: '4:3',  ratio: 4 / 3 },
  { value: '3:4',  ratio: 3 / 4 },
  { value: '16:9', ratio: 16 / 9 },
  { value: '9:16', ratio: 9 / 16 },
];

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

function pickClosestImagenAspectRatio(width, height) {
  const target = width / height;
  let best = IMAGEN_ASPECT_RATIOS[0];
  let bestDiff = Math.abs(target - best.ratio);
  for (const candidate of IMAGEN_ASPECT_RATIOS) {
    const diff = Math.abs(target - candidate.ratio);
    if (diff < bestDiff) {
      best = candidate;
      bestDiff = diff;
    }
  }
  return best.value;
}

function buildEnhancedPrompt({ productType, width, height, material, prompt }) {
  const aspectRatio = `${width}:${height}`;
  let basePrompt =
    `Create a professional PRINT-READY ${productType} design.\n` +
    `Size: ${width}" x ${height}" (${aspectRatio} aspect ratio EXACT).\n` +
    `Material: ${material}.\n` +
    `\n` +
    `Requirements:\n` +
    `- Exact aspect ratio match (no cropping required)\n` +
    `- High contrast, bold layout\n` +
    `- Large readable text for distance viewing\n` +
    `- Safe margins (no critical text near edges)\n` +
    `- Clean commercial print style\n` +
    `- No blur, no artifacts\n` +
    `\n` +
    `User request:\n` +
    `${prompt}\n`;

  if (productType === 'yard_sign') {
    basePrompt += '\nUse very large roadside-readable typography.';
  } else if (productType === 'banner') {
    basePrompt += '\nUse bold layout suitable for vinyl banners.';
  } else if (productType === 'car_magnet') {
    basePrompt += '\nDesign for vehicle visibility and branding clarity.';
  }

  return basePrompt;
}

/**
 * Loads Google service-account credentials from environment.
 * Supports either:
 *   - GOOGLE_APPLICATION_CREDENTIALS_JSON: raw or base64-encoded JSON content
 *   - GOOGLE_APPLICATION_CREDENTIALS: path to a JSON file (local dev)
 */
function getGoogleAuth() {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  if (!projectId) {
    throw new Error('GOOGLE_CLOUD_PROJECT_ID env var is not set.');
  }

  const credsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (credsJson) {
    let parsed;
    try {
      parsed = JSON.parse(credsJson);
    } catch {
      // Try base64 decode
      try {
        parsed = JSON.parse(Buffer.from(credsJson, 'base64').toString('utf8'));
      } catch {
        throw new Error(
          'GOOGLE_APPLICATION_CREDENTIALS_JSON is set but could not be parsed as JSON or base64-encoded JSON.'
        );
      }
    }
    return new GoogleAuth({
      projectId,
      credentials: parsed,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  }

  // Falls back to GOOGLE_APPLICATION_CREDENTIALS file path or platform ADC.
  return new GoogleAuth({
    projectId,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
}

/**
 * Calls the Vertex AI Imagen `:predict` REST endpoint.
 * Returns the first generated image as a base64 string (PNG).
 */
async function callImagen({ enhancedPrompt, imagenAspectRatio }) {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const location = process.env.VERTEX_AI_LOCATION || 'us-central1';
  const model = process.env.VERTEX_AI_IMAGEN_MODEL || 'imagegeneration@006';

  const auth = getGoogleAuth();
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const accessToken =
    typeof tokenResponse === 'string' ? tokenResponse : tokenResponse.token;
  if (!accessToken) {
    throw new Error('Failed to obtain Google access token for Vertex AI.');
  }

  const endpoint =
    `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}` +
    `/locations/${location}/publishers/google/models/${model}:predict`;

  const requestBody = {
    instances: [{ prompt: enhancedPrompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio: imagenAspectRatio,
      safetyFilterLevel: 'block_medium_and_above',
      personGeneration: 'allow_adult',
    },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Vertex AI Imagen request failed (${res.status}): ${text.slice(0, 500)}`
    );
  }

  const data = await res.json();
  const prediction =
    data && Array.isArray(data.predictions) ? data.predictions[0] : null;
  const b64 =
    prediction &&
    (prediction.bytesBase64Encoded || prediction.image || prediction.b64Json);
  if (!b64) {
    throw new Error(
      'Vertex AI Imagen returned no image data. Response may have been blocked by safety filters.'
    );
  }
  return b64;
}

/**
 * Center-crops the Imagen-generated image to match the EXACT product aspect
 * ratio (width / height). No stretching — just a cover-fit crop, then re-encoded
 * as PNG at full Imagen resolution along the matching axis.
 */
async function cropToExactAspectRatio(imageBase64, width, height) {
  const inputBuffer = Buffer.from(imageBase64, 'base64');
  const meta = await sharp(inputBuffer).metadata();
  const srcW = meta.width;
  const srcH = meta.height;
  if (!srcW || !srcH) {
    throw new Error('Could not read dimensions from generated image.');
  }

  const targetRatio = width / height;
  const srcRatio = srcW / srcH;

  let cropW = srcW;
  let cropH = srcH;
  if (Math.abs(srcRatio - targetRatio) > 0.001) {
    if (srcRatio > targetRatio) {
      // Source is wider than target — crop sides.
      cropH = srcH;
      cropW = Math.round(srcH * targetRatio);
    } else {
      // Source is taller than target — crop top/bottom.
      cropW = srcW;
      cropH = Math.round(srcW / targetRatio);
    }
  }

  const left = Math.max(0, Math.floor((srcW - cropW) / 2));
  const top = Math.max(0, Math.floor((srcH - cropH) / 2));

  const outBuffer = await sharp(inputBuffer)
    .extract({ left, top, width: cropW, height: cropH })
    .png({ compressionLevel: 6 })
    .toBuffer();

  return {
    base64: outBuffer.toString('base64'),
    width: cropW,
    height: cropH,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  // ---- Parse + validate input ---------------------------------------------
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body.' });
  }

  const { productType, width, height, material, prompt } = body || {};

  if (!productType || !ALLOWED_PRODUCT_TYPES.has(productType)) {
    return jsonResponse(400, {
      error:
        'productType is required and must be one of: banner, yard_sign, car_magnet.',
    });
  }

  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return jsonResponse(400, { error: 'width and height must be positive numbers (inches).' });
  }
  if (w > 600 || h > 600) {
    return jsonResponse(400, { error: 'width and height must each be 600 inches or less.' });
  }

  if (!material || typeof material !== 'string') {
    return jsonResponse(400, { error: 'material is required.' });
  }

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return jsonResponse(400, { error: 'prompt is required.' });
  }
  const trimmedPrompt = prompt.trim().slice(0, MAX_PROMPT_LENGTH);

  // ---- Build enhanced prompt ----------------------------------------------
  const enhancedPrompt = buildEnhancedPrompt({
    productType,
    width: w,
    height: h,
    material,
    prompt: trimmedPrompt,
  });
  const imagenAspectRatio = pickClosestImagenAspectRatio(w, h);

  // ---- Call Imagen + crop to exact ratio ----------------------------------
  try {
    const rawBase64 = await callImagen({
      enhancedPrompt,
      imagenAspectRatio,
    });
    const cropped = await cropToExactAspectRatio(rawBase64, w, h);

    return jsonResponse(200, {
      imageBase64: cropped.base64,
      mimeType: 'image/png',
      width: cropped.width,
      height: cropped.height,
      aspectRatio: `${w}:${h}`,
      imagenAspectRatio,
      prompt: trimmedPrompt,
    });
  } catch (err) {
    console.error('[generate-design] Generation failed:', err && err.message);
    if (err && err.stack) console.error(err.stack);
    return jsonResponse(500, {
      error: 'Failed to generate design.',
      details: err && err.message ? err.message : 'Unknown error',
    });
  }
};
