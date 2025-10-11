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
    console.log(`Uploading image ${index} to Cloudinary from URL: ${imageUrl}`);
    const result = await cloudinary.uploader.upload(imageUrl, {
      folder: 'ai-generated-banners',
      public_id: `banner-${Date.now()}-${index}`,
      resource_type: 'image'
    });
    
    console.log(`Successfully uploaded image ${index} to Cloudinary: ${result.secure_url}`);
    return {
      url: result.secure_url,
      cloudinary_public_id: result.public_id,
      width: result.width,
      height: result.height
    };
  } catch (error) {
    console.error(`Cloudinary upload error for image ${index}:`, error);
    throw new Error(`Failed to upload image ${index} to Cloudinary: ${error.message}`);
  }
}

async function generateSingleImage(openai, prompt, dalleSize, index) {
  try {
    console.log(`Generating variation ${index + 1} with DALL-E 3...`);
    
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: prompt,
      n: 1,
      size: dalleSize,
      quality: 'hd',
      style: 'vivid'
    });
    
    const imageUrl = response.data[0].url;
    console.log(`Generated image ${index + 1}: ${imageUrl}`);
    
    // Upload to Cloudinary
    const cloudinaryResult = await uploadToCloudinary(imageUrl, index);
    console.log(`Successfully processed image ${index + 1}`);
    
    return cloudinaryResult;
  } catch (error) {
    console.error(`Error generating variation ${index + 1}:`, error);
    throw new Error(`Failed to generate image ${index + 1}: ${error.message}`);
  }
}

async function generateWithDallE(prompt, size, variations = 3) {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  
  // Calculate dimensions at 150 DPI for print quality
  const widthPx = Math.round(size.wIn * 150);
  const heightPx = Math.round(size.hIn * 150);
  
  // DALL-E 3 only supports specific sizes, so we'll use 1792x1024 (landscape)
  const dalleSize = '1792x1024';
  
  console.log(`Generating ${variations} images with DALL-E 3 in parallel...`);
  console.log(`Target size: ${widthPx}x${heightPx}px (${size.wIn}x${size.hIn} inches at 150 DPI)`);
  
  // Generate all images in parallel
  const imagePromises = [];
  for (let i = 0; i < variations; i++) {
    imagePromises.push(generateSingleImage(openai, prompt, dalleSize, i));
  }
  
  // Wait for all images to complete
  const images = await Promise.all(imagePromises);
  console.log(`Successfully generated and uploaded all ${variations} images`);
  
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

    console.log('=== AI Banner Generation Request ===');
    console.log('Prompt:', prompt);
    console.log('Styles:', styles);
    console.log('Colors:', colors);
    console.log('Size:', size);

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
      console.error('OpenAI API key not configured');
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
      console.error('Cloudinary credentials not configured');
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
    console.log('Starting parallel image generation...');
    
    const images = await generateWithDallE(enhancedPrompt, size, variations);
    console.log('=== Generation Complete ===');
    console.log('Generated images:', images.length);

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
    console.error('=== Handler Error ===');
    console.error('Error:', error);
    console.error('Stack:', error.stack);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to generate images',
        details: error.message,
        type: error.name
      })
    };
  }
};
