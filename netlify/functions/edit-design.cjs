const OpenAI = require('openai');

function jsonResponse(statusCode, body) {
  return { statusCode, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    const { productType, width, height, material, editPrompt, originalPrompt, inspirationImage, brandMatchStrength = 'strong' } = body || {};
    if (!productType || !width || !height || !material || !editPrompt) return jsonResponse(400, { error: 'Missing required fields.' });
    if (!process.env.OPENAI_API_KEY) return jsonResponse(500, { error: 'AI editing is temporarily unavailable.' });
    const prompt = `Refine this existing ${productType.replace('_',' ')} design. Keep exact aspect ratio ${width}:${height}. Closely follow the uploaded branding reference. Brand match strength: ${brandMatchStrength}. Keep one flat print-ready final composition only. No mockups or scenes. Original intent: ${originalPrompt || ''}. Requested edit: ${String(editPrompt).trim()}.`;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const res = await openai.images.generate({ model: 'gpt-image-1', prompt: `${prompt}${inspirationImage ? '\nReference image provided for brand matching.' : ''}`, n: 1, size: Number(width) >= Number(height) ? '1536x1024' : '1024x1536', quality: 'high' });
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) return jsonResponse(500, { error: 'AI editing is temporarily unavailable.' });
    return jsonResponse(200, { imageBase64: b64, mimeType: 'image/png', width, height, aspectRatio: `${width}:${height}` });
  } catch (e) {
    console.error('[edit-design]', e && e.message);
    return jsonResponse(500, { error: 'Unable to process AI edit right now. Please try again.' });
  }
};
