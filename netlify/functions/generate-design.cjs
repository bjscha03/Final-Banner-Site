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
//   GOOGLE_CLOUD_PROJECT_ID   Required. GCP project id.
//   GOOGLE_CLIENT_EMAIL       Required. Service-account client email.
//   GOOGLE_PRIVATE_KEY        Required. Service-account private key. Stored as a
//                             single-line string with literal "\n" sequences,
//                             which are converted to real newlines at runtime.
//   VERTEX_AI_LOCATION        Optional. Defaults to "us-central1".
//   VERTEX_AI_IMAGEN_MODEL    Optional. Defaults to "imagen-3.0-generate-001".

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

function buildEnhancedPrompt({ productType, width, height, material, prompt, editPrompt, retryAttempt = 0 }) {
  const aspectRatio = `${width}:${height}`;
  const productLabel =
    productType === 'yard_sign' ? 'yard sign'
    : productType === 'car_magnet' ? 'car magnet'
    : 'vinyl banner';

  // Strict print-ready rules — applied to every Imagen call so the model
  // produces FLAT PRINT ARTWORK ONLY (the actual file that will print),
  // not a product mockup, scene render, or "design inside a design".
  //
  // The canvas IS the final print file. It is NOT a product preview.
  // Any physical mockup elements (gray background, hanging banner with
  // grommets/ropes/eyelets, perspective, shadows, walls, frames, etc.)
  // are forbidden — those are added separately in the live preview UI
  // as overlays and must never be baked into the generated image.
  let basePrompt =
    `Create a flat 2D print-ready ${productLabel} design.\n` +
    `This is NOT a product mockup. This image IS the final print file (the actual artwork that gets sent to the printer).\n` +
    `Canvas size: ${width}" x ${height}" (${aspectRatio} aspect ratio EXACT). Treat the entire canvas as the final print file.\n` +
    `Material: ${material}.\n` +
    `\n` +
    `POSITIVE REQUIREMENTS (must follow):\n` +
    `- Fill the ENTIRE canvas edge-to-edge with the actual printed design — no margins, no padding, no outer background, no mockup framing.\n` +
    `- Extremely bold, simple layout with high contrast colors that read from a distance.\n` +
    `- One main headline rendered very large.\n` +
    `- Optional short subheadline (only if it adds value); otherwise omit it.\n` +
    `- Use a solid colored or fully-designed background that fills 100% of the canvas.\n` +
    `- Output must look like a finished art file ready to send to a printer.\n` +
    `\n` +
    `HARD RULES — do NOT show ANY of the following (if you do, the image is rejected):\n` +
    `- NO banner hanging, mounted, displayed, or shown as a physical object in space.\n` +
    `- NO walls, NO floors, NO ceilings, NO rooms, NO indoor or outdoor scenes around the artwork.\n` +
    `- NO stands, NO X-stands, NO retractable banner stands, NO easels, NO tripods.\n` +
    `- NO poles, NO ropes, NO strings, NO bungee cords, NO chains, NO hooks.\n` +
    `- NO grommets, NO eyelets, NO metal rings, NO holes, NO corner screws, NO stakes, NO mounting hardware of any kind.\n` +
    `- NO shadows cast by the banner, NO drop shadow under the artwork, NO floating-card effect.\n` +
    `- NO perspective, NO tilt, NO angle, NO 3D look — render perfectly flat, head-on, 0° rotation, zero depth.\n` +
    `- NO lighting environment, NO studio lighting, NO ambient light gradients, NO vignette.\n` +
    `- NO gray background, NO neutral page/studio background behind the artwork, NO empty padding around the design.\n` +
    `- NO frame around the artwork, NO picture-frame border, NO mockup framing.\n` +
    `- NO banner displayed inside another image, NO "design inside a design", NO nested canvas, NO product photo.\n` +
    `- NO folds, NO curls, NO wrinkles, NO ripples, NO fabric texture overlay.\n` +
    `- NO tiny text, NO lorem ipsum, NO unreadable micro-text, NO decorative clutter.\n` +
    `- NO watermarks, NO logos that were not requested, NO signature.\n` +
    `\n` +
    `User request (the actual artwork to design):\n` +
    `${prompt}\n`;

  if (editPrompt && typeof editPrompt === 'string' && editPrompt.trim()) {
    basePrompt +=
      `\nEDIT INSTRUCTIONS (apply these changes to the artwork while keeping it FLAT, ` +
      `print-ready, and edge-to-edge as described above — do not add mockup elements):\n` +
      `${editPrompt.trim()}\n`;
  }

  if (productType === 'yard_sign') {
    basePrompt +=
      '\nYard sign specifics: Flat print artwork only. Use very large roadside-readable typography ' +
      'on a solid filled background. Do NOT draw a stake, H-frame, ground, grass, or any mounting hardware.';
  } else if (productType === 'banner') {
    basePrompt +=
      '\nBanner specifics: Flat print artwork only. Bold layout suitable for vinyl banners with an ' +
      'oversized headline on a solid filled background. Do NOT draw grommets, eyelets, ropes, hems, ' +
      'pole pockets, stands, or any hanging hardware — those are added separately by the print shop.';
  } else if (productType === 'car_magnet') {
    basePrompt +=
      '\nCar magnet specifics: Flat print artwork only. Design for vehicle visibility and branding ' +
      'clarity on a solid filled background, with oversized contact info if relevant. Do NOT draw a ' +
      'car, vehicle body, door panel, or any 3D magnet shape — render only the flat printed face.';
  }

  // Progressively stronger anti-mockup language on retry attempts triggered
  // by the post-generation hard-fail check (see detectMockupArtifacts).
  if (retryAttempt > 0) {
    basePrompt +=
      `\n\nCRITICAL — PREVIOUS ATTEMPT FAILED because it produced a product mockup ` +
      `(banner shown hanging on a stand inside a gray room). Do NOT do that again. ` +
      `The output MUST be ONLY the flat printed artwork filling the entire canvas. ` +
      `Imagine you are designing the art file in Photoshop or Illustrator at exactly ` +
      `${width}"×${height}" — that flat 2D artboard IS the entire output. There is no ` +
      `room, no stand, no hardware, no perspective, no shadow, and no gray border.`;
  }

  return basePrompt;
}

/**
 * Detects whether a generated image looks like a product mockup (i.e. the
 * actual artwork is a small element in the middle of a uniform neutral
 * background — wall/studio framing) instead of true flat print artwork that
 * fills the canvas edge-to-edge.
 *
 * Heuristic:
 *   1. Downsample to 64x64.
 *   2. Sample the perimeter band (outer ~10% on each side).
 *   3. If the perimeter is BOTH:
 *        - very low color variance (uniform), AND
 *        - near-grayscale (R≈G≈B) in the mid brightness range,
 *      AND the central region has clearly higher color variance than the
 *      perimeter, treat it as a mockup framing and return true.
 *
 * This is intentionally conservative — it should not reject legitimate flat
 * artwork that happens to use a solid bright color background.
 */
async function detectMockupArtifacts(imageBase64) {
  try {
    const buf = Buffer.from(imageBase64, 'base64');
    const SIZE = 64;
    const { data } = await sharp(buf)
      .resize(SIZE, SIZE, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const px = (x, y) => {
      const i = (y * SIZE + x) * 3;
      return [data[i], data[i + 1], data[i + 2]];
    };

    const border = Math.max(2, Math.floor(SIZE * 0.1)); // outer 10%
    const perimeter = [];
    const center = [];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const isPerimeter =
          x < border || x >= SIZE - border || y < border || y >= SIZE - border;
        const isCenter =
          x >= SIZE * 0.35 && x < SIZE * 0.65 &&
          y >= SIZE * 0.35 && y < SIZE * 0.65;
        if (isPerimeter) perimeter.push(px(x, y));
        else if (isCenter) center.push(px(x, y));
      }
    }

    const stats = (pixels) => {
      const n = pixels.length;
      let mr = 0, mg = 0, mb = 0;
      for (const [r, g, b] of pixels) { mr += r; mg += g; mb += b; }
      mr /= n; mg /= n; mb /= n;
      let vr = 0, vg = 0, vb = 0;
      for (const [r, g, b] of pixels) {
        vr += (r - mr) ** 2; vg += (g - mg) ** 2; vb += (b - mb) ** 2;
      }
      const stddev = Math.sqrt((vr + vg + vb) / (3 * n));
      return { mr, mg, mb, stddev };
    };

    const p = stats(perimeter);
    const c = stats(center);

    // Is the perimeter near-grayscale (R≈G≈B)?
    const gray = Math.max(
      Math.abs(p.mr - p.mg),
      Math.abs(p.mg - p.mb),
      Math.abs(p.mr - p.mb),
    ) < 14;
    // Is the perimeter brightness in the mid range (typical room/studio)?
    const brightness = (p.mr + p.mg + p.mb) / 3;
    const midBrightness = brightness > 50 && brightness < 220;
    // Is the perimeter uniform?
    const perimeterUniform = p.stddev < 18;
    // Is the center clearly more colorful/varied than the perimeter?
    const centerHasContent = c.stddev > p.stddev + 12;

    const isMockup = gray && midBrightness && perimeterUniform && centerHasContent;
    if (isMockup) {
      console.log(
        '[generate-design] Mockup artifact detected — perimeter mean=' +
        `(${p.mr.toFixed(0)},${p.mg.toFixed(0)},${p.mb.toFixed(0)}) ` +
        `stddev=${p.stddev.toFixed(1)}, center stddev=${c.stddev.toFixed(1)}.`,
      );
    }
    return isMockup;
  } catch (err) {
    console.warn('[generate-design] detectMockupArtifacts failed:', err && err.message);
    return false;
  }
}

/**
 * Calls Imagen with up to MAX_ATTEMPTS attempts, automatically regenerating
 * with a stronger anti-mockup prompt if the result trips the hard-fail check.
 */
const MAX_GENERATION_ATTEMPTS = 3;
async function generateWithRetry({ productType, width, height, material, prompt, editPrompt, imagenAspectRatio }) {
  let lastBase64 = null;
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const enhancedPrompt = buildEnhancedPrompt({
      productType, width, height, material, prompt, editPrompt,
      retryAttempt: attempt,
    });
    const rawBase64 = await callImagen({ enhancedPrompt, imagenAspectRatio });
    lastBase64 = rawBase64;
    const isMockup = await detectMockupArtifacts(rawBase64);
    if (!isMockup) {
      return { rawBase64, attempts: attempt + 1, regenerated: attempt > 0 };
    }
    console.log(
      `[generate-design] Attempt ${attempt + 1}/${MAX_GENERATION_ATTEMPTS} ` +
      `produced a mockup — regenerating with stronger anti-mockup prompt.`,
    );
  }
  // All attempts looked like mockups — return the last one anyway so the
  // user still gets an image, but log a warning.
  console.warn(
    '[generate-design] All attempts tripped the mockup detector; returning last result.',
  );
  return { rawBase64: lastBase64, attempts: MAX_GENERATION_ATTEMPTS, regenerated: true };
}

/**
 * Loads Google service-account credentials from environment variables and
 * builds an explicit GoogleAuth instance. Does NOT use Application Default
 * Credentials, since they are not available in the Netlify Functions runtime.
 *
 * Required env vars:
 *   - GOOGLE_CLOUD_PROJECT_ID
 *   - GOOGLE_CLIENT_EMAIL
 *   - GOOGLE_PRIVATE_KEY  (single-line with literal "\n" sequences)
 */
function getGoogleAuth() {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  if (!projectId) {
    throw new Error('GOOGLE_CLOUD_PROJECT_ID env var is not set.');
  }

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  if (!clientEmail) {
    throw new Error('GOOGLE_CLIENT_EMAIL env var is not set.');
  }

  const rawPrivateKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!rawPrivateKey) {
    throw new Error('GOOGLE_PRIVATE_KEY env var is not set.');
  }
  // GOOGLE_PRIVATE_KEY is stored in Netlify as a single-line string with
  // literal "\n" sequences; convert them to real newlines for PEM parsing.
  const privateKey = rawPrivateKey.replace(/\\n/g, '\n');

  return new GoogleAuth({
    projectId,
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
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
  const model = process.env.VERTEX_AI_IMAGEN_MODEL || 'imagen-3.0-generate-001';

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
    // 600" (50 ft) is a generous upper bound for the largest realistic
    // banner the site sells; rejects nonsense input early before we spend
    // an Imagen call on it.
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
  const imagenAspectRatio = pickClosestImagenAspectRatio(w, h);

  // ---- Call Imagen (with auto-regeneration on mockup detection) + crop ----
  try {
    const { rawBase64, attempts, regenerated } = await generateWithRetry({
      productType,
      width: w,
      height: h,
      material,
      prompt: trimmedPrompt,
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
      attempts,
      regenerated,
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

// Exported helpers so sibling Netlify functions (e.g. edit-design.cjs) can
// reuse the exact same Vertex AI Imagen pipeline + prompt enforcement.
exports.buildEnhancedPrompt = buildEnhancedPrompt;
exports.callImagen = callImagen;
exports.cropToExactAspectRatio = cropToExactAspectRatio;
exports.pickClosestImagenAspectRatio = pickClosestImagenAspectRatio;
exports.detectMockupArtifacts = detectMockupArtifacts;
exports.generateWithRetry = generateWithRetry;
exports.ALLOWED_PRODUCT_TYPES = ALLOWED_PRODUCT_TYPES;
exports.MAX_PROMPT_LENGTH = MAX_PROMPT_LENGTH;
