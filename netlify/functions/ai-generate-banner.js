const { GoogleGenAI } = require('@google/genai');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Calculate nearest supported aspect ratio for Imagen
function nearestImagenAR(widthIn, heightIn) {
  const inputRatio = widthIn / heightIn;
  const supportedRatios = [
    { ratio: 1, ar: '1:1' },
    { ratio: 4/3, ar: '4:3' },
    { ratio: 3/4, ar: '3:4' },
    { ratio: 16/9, ar: '16:9' },
    { ratio: 9/16, ar: '9:16' }
  ];
  
  let closest = supportedRatios[0];
  let minDiff = Math.abs(inputRatio - closest.ratio);
  
  for (const ar of supportedRatios) {
    const diff = Math.abs(inputRatio - ar.ratio);
    if (diff < minDiff) {
      minDiff = diff;
      closest = ar;
    }
  }
  
  return closest.ar;
}

// Enhanced prompt engineering
function enhancePrompt(prompt, styles = [], colors = [], size) {
  let enhancedPrompt = `High-quality professional banner background image: ${prompt}`;
  
  // Add style influences with more specific descriptions
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
  
  // Add color influences with better color mapping
  if (colors && colors.length > 0) {
    const colorNames = colors.map(color => {
      // Convert hex to color names for better AI understanding
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
  
  // Add banner-specific instructions with emphasis on quality
  enhancedPrompt += '. Requirements: wide landscape banner format, suitable for large format printing, ultra high quality, professional commercial photography style, vibrant colors, sharp details, no text or logos, clean composition';
  
  return enhancedPrompt;
}

// Generate images using Google GenAI
async function generateWithImagen(prompt, variations, quality, size) {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY environment variable is required');
  }

  const ai = new GoogleGenAI({ apiKey });
  
  // Use standard quality by default for better results
  const modelName = quality === 'fast' ? 'imagen-4.0-fast-generate-001' : 'imagen-4.0-generate-001';
  
  const aspectRatio = nearestImagenAR(size.wIn, size.hIn);
  
  const response = await ai.models.generateImages({
    model: modelName,
    prompt: prompt,
    config: {
      candidateCount: variations,
      aspectRatio: aspectRatio,
      personGeneration: 'allow_adult',
      ...(modelName === 'imagen-4.0-generate-001' ? { sampleImageSize: '2K' } : {})
    },
  });

  if (!response.images || response.images.length === 0) {
    throw new Error('No images generated');
  }

  // Upload to Cloudinary and return URLs
  const images = [];
  for (let i = 0; i < response.images.length; i++) {
    const imageData = response.images[i];
    
    // Convert base64 to buffer
    const buffer = Buffer.from(imageData.split(',')[1], 'base64');
    
    // Upload to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: 'image',
          folder: 'ai-generated-banners',
          format: 'jpg',
          quality: 'auto:best'
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(buffer);
    });

    images.push({
      url: uploadResult.secure_url,
      cloudinary_public_id: uploadResult.public_id,
      width: uploadResult.width,
      height: uploadResult.height
    });
  }

  return images;
}

// Fallback placeholder images
function generatePlaceholderImages(variations, size) {
  const images = [];
  const colors = ['FF6B6B', '4ECDC4', '45B7D1', 'FFA07A', '98D8C8'];
  
  for (let i = 0; i < variations; i++) {
    const color = colors[i % colors.length];
    const width = Math.round(size.wIn * 100);
    const height = Math.round(size.hIn * 100);
    
    images.push({
      url: `https://via.placeholder.com/${width}x${height}/${color}/FFFFFF?text=AI+Generated+Banner+${i + 1}`,
      cloudinary_public_id: null,
      width: width,
      height: height,
      placeholder: true
    });
  }
  
  return images;
}

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { prompt, styles = [], colors = [], size, variations = 3, quality = 'standard', debugMode = false } = JSON.parse(event.body);

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

    // Enhanced prompt engineering
    const enhancedPrompt = enhancePrompt(prompt, styles, colors, size);
    
    if (debugMode) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          debug: {
            originalPrompt: prompt,
            enhancedPrompt: enhancedPrompt,
            styles: styles,
            colors: colors,
            size: size,
            variations: variations,
            quality: quality,
            aspectRatio: nearestImagenAR(size.wIn, size.hIn)
          }
        })
      };
    }

    let images;
    try {
      // Try to generate with Imagen
      images = await generateWithImagen(enhancedPrompt, variations, quality, size);
    } catch (error) {
      console.error('AI generation failed, using placeholders:', error);
      // Fall back to placeholder images
      images = generatePlaceholderImages(variations, size);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        images: images,
        prompt: enhancedPrompt,
        metadata: {
          model: quality === 'fast' ? 'imagen-4.0-fast-generate-001' : 'imagen-4.0-generate-001',
          aspectRatio: nearestImagenAR(size.wIn, size.hIn),
          variations: variations
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
