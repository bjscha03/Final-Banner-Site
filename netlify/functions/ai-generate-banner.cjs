const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

function enhancePrompt(prompt, styles = [], colors = [], size) {
  let enhancedPrompt = `High-quality professional banner background image: ${prompt}`;
  
  if (styles && styles.length > 0) {
    const styleDescriptions = {
      'corporate': 'clean, professional, business-appropriate, polished',
      'kid-friendly': 'colorful, playful, fun, child-appropriate, cheerful, bright',
      'elegant': 'sophisticated, refined, luxurious, classy, upscale',
      'modern': 'contemporary, sleek, minimalist, cutting-edge',
      'vintage': 'retro, classic, nostalgic, timeless',
      'playful': 'fun, energetic, vibrant, lively, dynamic',
      'minimalist': 'clean, simple, uncluttered, spacious'
    };
    const styleText = styles.map(style => styleDescriptions[style] || style).join(', ');
    enhancedPrompt += `. Style: ${styleText}`;
  }
  
  if (colors && colors.length > 0) {
    const colorNames = colors.map(color => {
      const colorMap = {
        '#FF0000': 'bright red', '#00FF00': 'bright green', '#0000FF': 'bright blue',
        '#FFFF00': 'bright yellow', '#FF00FF': 'bright magenta', '#00FFFF': 'bright cyan',
        '#FFA500': 'orange', '#800080': 'purple', '#FFC0CB': 'pink',
        '#FF69B4': 'hot pink', '#32CD32': 'lime green', '#87CEEB': 'sky blue',
        '#FFD700': 'gold', '#FF1493': 'deep pink', '#00CED1': 'dark turquoise',
        '#FF4500': 'orange red', '#9370DB': 'medium purple', '#20B2AA': 'light sea green'
      };
      return colorMap[color.toUpperCase()] || `vibrant ${color} color`;
    });
    enhancedPrompt += `. Colors: prominently featuring ${colorNames.join(', ')} as the main color scheme`;
  }
  
  enhancedPrompt += '. Requirements: wide landscape banner format, suitable for large format printing, ultra high quality, professional commercial photography style, vibrant colors, sharp details, no text or logos, clean composition';
  return enhancedPrompt;
}

function generateDemoImages(variations, size) {
  const images = [];
  const width = Math.round(size.wIn * 100);
  const height = Math.round(size.hIn * 100);
  
  const colorSchemes = [
    { bg: '4A90E2', fg: 'FFFFFF', text: 'AI Demo 1' },
    { bg: 'E24A90', fg: 'FFFFFF', text: 'AI Demo 2' },
    { bg: '90E24A', fg: 'FFFFFF', text: 'AI Demo 3' }
  ];
  
  for (let i = 0; i < variations; i++) {
    const scheme = colorSchemes[i % colorSchemes.length];
    const dummyImageUrl = `https://dummyimage.com/${width}x${height}/${scheme.bg}/${scheme.fg}.png&text=${encodeURIComponent(scheme.text)}`;
    
    images.push({
      url: dummyImageUrl,
      cloudinary_public_id: `demo-${scheme.bg}-${i}`,
      width: width,
      height: height,
      placeholder: true
    });
  }
  
  return images;
}

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { prompt, styles = [], colors = [], size } = body;
    const variations = 3;

    if (!prompt) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Prompt is required' })
      };
    }

    if (!size || !size.wIn || !size.hIn) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Size with wIn and hIn is required' })
      };
    }

    const enhancedPrompt = enhancePrompt(prompt, styles, colors, size);
    console.log('Enhanced prompt:', enhancedPrompt);
    console.log('Generating demo images using DummyImage');
    
    const images = generateDemoImages(variations, size);
    console.log('Generated image URLs:', images.map(img => img.url));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        images: images,
        prompt: enhancedPrompt,
        metadata: {
          model: 'demo-mode',
          variations: variations,
          note: 'Using demo images. Configure REPLICATE_API_KEY for AI generation.'
        }
      })
    };

  } catch (error) {
    console.error('Handler error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      })
    };
  }
};
