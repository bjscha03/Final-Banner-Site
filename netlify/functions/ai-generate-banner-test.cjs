const OpenAI = require('openai');

exports.handler = async (event) => {
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
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ success: false, status: 405, code: 'method_not_allowed', type: 'request_validation', message: 'Method not allowed' }) };

  try {
    if (!process.env.OPENAI_API_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ success: false, stepFailed: 'openai_request', status: 500, code: 'missing_openai_key', type: 'config_error', message: 'OPENAI_API_KEY missing' }) };
    }

    const body = JSON.parse(event.body || '{}');
    const prompt = (body.prompt || 'Professional flat print-ready banner, bold readable text, no mockup, no hardware.').trim();
    const size = body.size || '1536x1024';

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.images.generate({ model: 'gpt-image-1', prompt, size, n: 1 });
    const image = response?.data?.[0] || {};
    const imageSource = image.url || (image.b64_json ? `data:image/png;base64,${image.b64_json}` : null);

    if (!imageSource) {
      return { statusCode: 500, headers, body: JSON.stringify({ success: false, stepFailed: 'response_handling', status: 500, code: 'no_image_returned', type: 'openai_response_error', message: 'No image returned from OpenAI' }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, status: 200, code: null, type: null, message: null, model: 'gpt-image-1', image: { url: imageSource }, prompt })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        stepFailed: 'openai_request',
        status: error?.status || error?.response?.status || 500,
        code: error?.code || error?.response?.data?.error?.code || null,
        type: error?.type || error?.response?.data?.error?.type || null,
        message: error?.message || 'Unknown OpenAI error',
        error: error?.response?.data || null
      })
    };
  }
};
