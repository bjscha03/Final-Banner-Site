const fetch = require('node-fetch');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { prompt, aspectRatio } = JSON.parse(event.body);

    if (!prompt || !aspectRatio) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing prompt or aspectRatio' })
      };
    }

    const sizeMap = {
      '3:2': '1792x1024',
      '2:3': '1024x1792',
      '1:1': '1024x1024'
    };

    const size = sizeMap[aspectRatio] || '1792x1024';

    console.log('Generating preview with DALL-E 3:', { prompt, size });

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: prompt,
        n: 1,
        size: size,
        quality: 'standard',
        response_format: 'url'
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API error:', errorData);
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ 
          error: 'Failed to generate image',
          details: errorData
        })
      };
    }

    const data = await response.json();
    
    if (!data.data || !data.data[0] || !data.data[0].url) {
      console.error('Unexpected API response:', data);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Invalid response from image generation API' })
      };
    }

    const imageUrl = data.data[0].url;
    console.log('Generated image URL:', imageUrl);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        imageUrl: imageUrl,
        revisedPrompt: data.data[0].revised_prompt || prompt
      })
    };

  } catch (error) {
    console.error('Error in ai-preview-image:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      })
    };
  }
};
