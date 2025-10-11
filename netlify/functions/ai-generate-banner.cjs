const OpenAI = require('openai');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
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

async function uploadToCloudinary(imageUrl, index) {
  try {
    const result = await cloudinary.uploader.upload(imageUrl, {
      folder: 'ai-generated-banners',
      public_id: `banner-${Date.now()}-${index}`,
      resource_type: 'image'
    });
    
    return {
      url: result.secure_url,
      cloudinary_public_id: result.public_id,
      width: result.width,
      height: result.height
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
}

async function generateWithDallE(prompt, size, variations = 3) {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  const images = [];
  
  // Calculate dimensions at 150 DPI for print quality
  const widthPx = Math.round(size.wIn * 150);
  const heightPx = Math.round(size.hIn * 150);
  
  // DALL-E 3 only supports specific sizes, so we'll use 1792x1024 (landscape) and crop/resize later
  const dalleSize = '1792x1024';
  
  console.log(`Generating ${variations} images with DALL-E 3...`);
  console.log(`Target size: ${widthPx}x${heightPx}px (${size.wIn}x${size.hIn} inches at 150 DPI)`);
  
  for (let i = 0; i < variations; i++) {
    try {
      console.log(`Generating variation ${i + 1}/${variations}...`);
      
      const response = await openai.images.generate({
        model: 'dall-e-3',
        prompt: prompt,
        n: 1,
        size: dalleSize,
        quality: 'hd',
        style: 'vivid'
      });
      
      const imageUrl = response.data[0].url;
      console.log(`Generated image ${i + 1}: ${imageUrl}`);
      
      // Upload to Cloudinary
      console.log(`Uploading image ${i + 1} to Cloudinary...`);
      const cloudinaryResult = await uploadToCloudinary(imageUrl, i);
      
      images.push(cloudinaryResult);
      console.log(`Successfully uploaded image ${i + 1} to Cloudinary`);
      
    } catch (error) {
      console.error(`Error generating variation ${i + 1}:`, error);
      throw error;
    }
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

    // Check for OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'OpenAI API key not configured',
          details: 'Please set OPENAI_API_KEY environment variable in Netlify'
        })
      };
    }

    // Check for Cloudinary credentials
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Cloudinary not configured',
          details: 'Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables in Netlify'
        })
      };
    }

    const enhancedPrompt = enhancePrompt(prompt, styles, colors, size);
    console.log('Enhanced prompt:', enhancedPrompt);
    console.log('Generating images with DALL-E 3...');
    
    const images = await generateWithDallE(enhancedPrompt, size, variations);
    console.log('Successfully generated and uploaded all images');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        images: images,
        prompt: enhancedPrompt,
        metadata: {
          model: 'dall-e-3',
          variations: variations,
          quality: 'hd',
          style: 'vivid'
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
