const sharp = require('sharp');
const { uploadBufferToR2 } = require('./lib/r2-client.cjs');

const REQUIRED_ENV_VARS = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_ENDPOINT',
];

function envStatus() {
  const present = [];
  const missing = [];

  for (const name of REQUIRED_ENV_VARS) {
    if (process.env[name]) present.push(name);
    else missing.push(name);
  }

  return { present, missing };
}

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

async function makePayloadBuffer(payload) {
  if (payload?.text && typeof payload.text === 'string') {
    return {
      buffer: Buffer.from(payload.text.slice(0, 200), 'utf8'),
      contentType: 'text/plain; charset=utf-8',
      ext: 'txt',
      kind: 'text',
    };
  }

  const width = Number(payload?.width) > 0 ? Math.min(Number(payload.width), 256) : 128;
  const height = Number(payload?.height) > 0 ? Math.min(Number(payload.height), 256) : 128;

  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 59, g: 130, b: 246, alpha: 1 },
    },
  }).png().toBuffer();

  return {
    buffer,
    contentType: 'image/png',
    ext: 'png',
    kind: 'generated-image',
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed. Use POST.' }) };
  }

  const verification = envStatus();

  try {
    const payload = event.body ? JSON.parse(event.body) : {};
    const { buffer, contentType, ext, kind } = await makePayloadBuffer(payload);

    const key = `r2-phase1-tests/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const uploadResult = await uploadBufferToR2({ key, body: buffer, contentType, cacheControl: 'no-store' });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        phase: 'phase-1-r2-verification-only',
        upload: {
          kind,
          key: uploadResult.key,
          bucket: uploadResult.bucket,
          ...(uploadResult.url ? { url: uploadResult.url } : {}),
          bytes: buffer.length,
          contentType,
        },
        envVerification: {
          present: verification.present,
          missing: verification.missing,
          note: 'Only env var names are returned. Secret values are never exposed.',
        },
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        phase: 'phase-1-r2-verification-only',
        error: error.message,
        envVerification: {
          present: verification.present,
          missing: verification.missing,
          note: 'Only env var names are returned. Secret values are never exposed.',
        },
      }),
    };
  }
};
