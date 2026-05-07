const OpenAI = require('openai');

const DEFAULT_PROMPT = 'Create one flat print-ready vinyl banner design for a grand opening sale. No mockups, no grommets, no wall scene.';
const DEFAULT_SIZE = '1536x1024';
const MODEL = 'gpt-image-1';

exports.handler = async (event) => {
  const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);

  if (!hasOpenAIKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        hasOpenAIKey,
        model: MODEL,
        imageReturned: false,
        rawOpenAIError: 'Missing OPENAI_API_KEY'
      })
    };
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    let body = {};
    if (event.httpMethod === 'POST' && event.body) {
      try { body = JSON.parse(event.body); } catch (_) { body = {}; }
    }

    const prompt = typeof body.prompt === 'string' && body.prompt.trim() ? body.prompt.trim() : DEFAULT_PROMPT;
    const size = typeof body.size === 'string' && body.size.trim() ? body.size.trim() : DEFAULT_SIZE;

    const result = await openai.images.generate({
      model: MODEL,
      prompt,
      size,
      n: 1
    });

    const image = result?.data?.[0] || {};
    const imageUrl = image.url || null;
    const base64 = image.b64_json || null;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        hasOpenAIKey,
        model: MODEL,
        imageReturned: Boolean(imageUrl || base64),
        imageUrl,
        base64Length: base64 ? base64.length : 0,
        imageBase64: base64,
        prompt,
        size
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        hasOpenAIKey,
        model: MODEL,
        imageReturned: false,
        rawOpenAIError: {
          message: error?.message || 'Unknown OpenAI error',
          name: error?.name || null,
          status: error?.status || null,
          code: error?.code || null,
          type: error?.type || null,
          param: error?.param || null
        }
      })
    };
  }
};
