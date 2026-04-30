// netlify/functions/edit-design.cjs
//
// "Edit with AI" backend: takes an existing AI-generated design plus an
// edit instruction from the user (e.g. "make the background red", "change
// headline to GRAND OPENING") and returns an updated print-ready design
// at the EXACT same product canvas dimensions as the original.
//
// Inputs (POST JSON):
//   {
//     productType: "banner" | "yard_sign" | "car_magnet",
//     width:  number (inches),
//     height: number (inches),
//     material: string,
//     editPrompt: string (required, max 500 chars) - what to change,
//     originalPrompt?: string (optional, max 500 chars) - the prompt used
//       to generate the current design. Used to preserve intent.
//     currentImageBase64?: string (optional) - base64 PNG of the current
//       design. Reserved for true image-to-image when supported by the
//       Vertex model. With imagen-3.0-generate-001 we fall back to
//       prompt-only regeneration that combines originalPrompt + editPrompt.
//   }
//
// Output (matches generate-design.cjs):
//   { imageBase64, mimeType, width, height, aspectRatio, prompt, editPrompt }

const {
  cropToExactAspectRatio,
  pickClosestImagenAspectRatio,
  generateWithRetry,
  ALLOWED_PRODUCT_TYPES,
  MAX_PROMPT_LENGTH,
} = require('./generate-design.cjs');

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

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body.' });
  }

  const {
    productType,
    width,
    height,
    material,
    editPrompt,
    originalPrompt,
    // currentImageBase64 is accepted for forward-compatibility with
    // image-to-image models but not currently sent to Imagen 3.0 generate.
    // eslint-disable-next-line no-unused-vars
    currentImageBase64,
  } = body || {};

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

  if (!editPrompt || typeof editPrompt !== 'string' || !editPrompt.trim()) {
    return jsonResponse(400, { error: 'editPrompt is required.' });
  }

  const trimmedEditPrompt = editPrompt.trim().slice(0, MAX_PROMPT_LENGTH);
  const trimmedOriginalPrompt =
    typeof originalPrompt === 'string' && originalPrompt.trim()
      ? originalPrompt.trim().slice(0, MAX_PROMPT_LENGTH)
      : '';

  // Combine original + edit prompts. If we have no original, fall back to
  // a generic anchor so the regeneration still produces a printable design.
  const effectiveBasePrompt =
    trimmedOriginalPrompt ||
    `A simple, bold ${productType.replace('_', ' ')} design.`;

  const imagenAspectRatio = pickClosestImagenAspectRatio(w, h);

  try {
    const { rawBase64, attempts, regenerated } = await generateWithRetry({
      productType,
      width: w,
      height: h,
      material,
      prompt: effectiveBasePrompt,
      editPrompt: trimmedEditPrompt,
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
      prompt: trimmedOriginalPrompt,
      editPrompt: trimmedEditPrompt,
      attempts,
      regenerated,
    });
  } catch (err) {
    console.error('[edit-design] Generation failed:', err && err.message);
    if (err && err.stack) console.error(err.stack);
    return jsonResponse(500, {
      error: 'Failed to edit design.',
      details: err && err.message ? err.message : 'Unknown error',
    });
  }
};
