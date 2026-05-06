const OpenAI = require('openai');
const cloudinary = require('cloudinary').v2;
const { neon } = require('@neondatabase/serverless');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

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

exports.handler = async (event) => {
  const fnStart = Date.now();
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const body = JSON.parse(event.body || '{}');
    const { prompt, size, userEmail, productType, width, height, inspirationImage, brandMatchStrength, styleChips } = body;

    if (!prompt || !prompt.trim()) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Prompt is required' }) };
    if (!size?.wIn || !size?.hIn) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Size with wIn and hIn is required' }) };
    if (!process.env.OPENAI_API_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'OpenAI API key not configured' }) };
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Cloudinary not configured' }) };

    const isProduction = process.env.CONTEXT === 'production' || process.env.NODE_ENV === 'production';
    const isAdmin = userEmail ? await assertAdminAccess(userEmail) : false;
    if (isProduction && !isAdmin) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Admin access required in production' }) };

    const promptText = enhancePrompt({ prompt: `${prompt.trim()}\n\nProfessional large-format ${productType || 'banner'} for ${width || size.wIn}x${height || size.hIn}.`, size, inspirationImage, brandMatchStrength, styleChips });
    const aspect = size.wIn / size.hIn;
    const dalleSize = aspect >= 1 ? '1536x1024' : '1024x1536';

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    console.log('[AI-Gen] OpenAI request start', { at: new Date().toISOString(), size: dalleSize });
    const openaiStart = Date.now();
    const response = await openai.images.generate({
      model: 'gpt-image-1',
      prompt: promptText,
      n: 1,
      size: dalleSize,
      quality: 'high'
    });
    console.log('[AI-Gen] OpenAI request end', { ms: Date.now() - openaiStart, at: new Date().toISOString() });

    const image = response.data?.[0] || {};
    const imageSource = image.url || (image.b64_json ? `data:image/png;base64,${image.b64_json}` : null);
    if (!imageSource) throw new Error('OpenAI returned no image payload');

    console.log('[AI-Gen] Cloudinary upload start', { at: new Date().toISOString() });
    const cloudStart = Date.now();
    const uploaded = await cloudinary.uploader.upload(imageSource, {
      folder: 'ai-generated-banners',
      public_id: `banner-${Date.now()}`,
      resource_type: 'image',
      timeout: 45000
    });
    console.log('[AI-Gen] Cloudinary upload end', { ms: Date.now() - cloudStart, at: new Date().toISOString() });
    console.log('[AI-Gen] Total function duration', { ms: Date.now() - fnStart });

    const resultImage = {
      url: uploaded.secure_url,
      cloudinary_public_id: uploaded.public_id,
      width: uploaded.width,
      height: uploaded.height
    };

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, image: resultImage, prompt: promptText, metadata: { model: 'gpt-image-1', count: 1, quality: 'high' } }) };
  } catch (error) {
    console.error('[AI-Gen] Error', error);
    console.log('[AI-Gen] Total function duration', { ms: Date.now() - fnStart });
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'AI design generation is temporarily unavailable. Please try again.' }) };
  }
};
