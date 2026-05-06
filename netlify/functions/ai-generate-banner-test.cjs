const OpenAI = require('openai');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    if (!process.env.OPENAI_API_KEY) return { statusCode: 500, headers, body: JSON.stringify({ success: false, stepFailed: 'openai_request', error: 'OPENAI_API_KEY missing' }) };
    const body = JSON.parse(event.body || '{}');
    const prompt = (body.prompt || 'Professional flat print-ready banner, bold readable text, no mockup, no hardware.').trim();
    const size = body.size || '1536x1024';

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.images.generate({ model: 'gpt-image-1', prompt, size, n: 1 });
    const image = response?.data?.[0] || {};
    const imageSource = image.url || (image.b64_json ? `data:image/png;base64,${image.b64_json}` : null);
    if (!imageSource) return { statusCode: 500, headers, body: JSON.stringify({ success: false, stepFailed: 'response_handling', error: 'No image returned from OpenAI' }) };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        step: 'text_only_generation',
        model: 'gpt-image-1',
        openaiStatus: 'ok',
        imageReturned: true,
        image: { url: imageSource }
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        stepFailed: 'openai_request',
        openaiStatus: 'failed',
        error: {
          status: error?.status || error?.response?.status || null,
          code: error?.code || error?.response?.data?.error?.code || null,
          type: error?.type || error?.response?.data?.error?.type || null,
          message: error?.message || 'Unknown OpenAI error'
        }
      })
    };
  }
};
