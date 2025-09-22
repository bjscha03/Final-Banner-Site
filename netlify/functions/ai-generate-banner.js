const { GoogleGenAI } = require('@google/genai');
const { v2: cloudinary } = require('cloudinary');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Supported aspect ratios for Imagen
const IMAGEN_ASPECT_RATIOS = [
  { ratio: '1:1', value: 1.0 },
  { ratio: '9:16', value: 0.5625 },
  { ratio: '16:9', value: 1.7778 },
  { ratio: '3:4', value: 0.75 },
  { ratio: '4:3', value: 1.3333 }
];

function nearestImagenAR(width, height) {
  const targetRatio = width / height;
  let closest = IMAGEN_ASPECT_RATIOS[0];
  let minDiff = Math.abs(targetRatio - closest.value);
  
  for (const ar of IMAGEN_ASPECT_RATIOS) {
    const diff = Math.abs(targetRatio - ar.value);
    if (diff < minDiff) {
      minDiff = diff;
      closest = ar;
    }
  }
  
  return closest.ratio;
}

// Enhanced prompt engineering
function enhancePrompt(prompt, styles = [], colors = [], size) {
  let enhancedPrompt = `Professional landscape banner format banner background: ${prompt}`;
  
  // Add style influences
  if (styles && styles.length > 0) {
    const styleDescriptions = {
      'corporate': 'clean, professional, business-appropriate',
      'kid-friendly': 'colorful, playful, fun, child-appropriate',
      'elegant': 'sophisticated, refined, luxurious',
      'modern': 'contemporary, sleek, minimalist',
      'vintage': 'retro, classic, nostalgic',
      'playful': 'fun, energetic, vibrant',
      'minimalist': 'clean, simple, uncluttered'
    };
    
    const styleText = styles.map(style => styleDescriptions[style] || style).join(', ');
    enhancedPrompt += `, ${styleText} style`;
  }
  
  // Add color influences
  if (colors && colors.length > 0) {
    const colorNames = colors.map(color => {
      // Convert hex to color names for better AI understanding
      const colorMap = {
        '#FF0000': 'bright red', '#00FF00': 'bright green', '#0000FF': 'bright blue',
        '#FFFF00': 'bright yellow', '#FF00FF': 'bright magenta', '#00FFFF': 'bright cyan',
        '#FFA500': 'orange', '#800080': 'purple', '#FFC0CB': 'pink',
        '#FF69B4': 'hot pink', '#32CD32': 'lime green', '#87CEEB': 'sky blue'
      };
      return colorMap[color.toUpperCase()] || `color ${color}`;
    });
    enhancedPrompt += `, prominently featuring ${colorNames.join(', ')} colors`;
  }
  
  // Add banner-specific instructions
  enhancedPrompt += ', wide banner composition, suitable for banner printing, high quality, professional photography style, no text or logos';
  
  return enhancedPrompt;
}

// Generate images using Google GenAI
async function generateWithImagen(prompt, variations, quality, size) {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY environment variable is required');
  }

  const ai = new GoogleGenAI({ apiKey });
  
  // Determine model based on quality
  const modelName = quality === 'fast' ? 'imagen-4.0-fast-generate-001' : 'imagen-4.0-generate-001';
  
  // Calculate nearest supported aspect ratio
  const aspectRatio = nearestImagenAR(size.wIn, size.hIn);
  
  try {
    const response = await ai.models.generateImages({
      model: modelName,
      prompt: prompt,
      config: {
        numberOfImages: variations,
        aspectRatio: aspectRatio,
        personGeneration: 'allow_adult',
        ...(modelName === 'imagen-4.0-generate-001' ? { sampleImageSize: '2K' } : {})
      },
    });

    if (!response.generatedImages || response.generatedImages.length === 0) {
      throw new Error('No images generated');
    }

    const images = [];
    for (let i = 0; i < response.generatedImages.length; i++) {
      const imageData = response.generatedImages[i];
      
      // Convert base64 to buffer
      const imageBuffer = Buffer.from(imageData.image.imageBytes, 'base64');
      
      // Upload to Cloudinary
      const uploadResult = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            resource_type: 'image',
            folder: 'ai-generated-banners',
            format: 'jpg',
            quality: 'auto:good'
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        ).end(imageBuffer);
      });

      images.push({
        url: uploadResult.secure_url,
        cloudinary_public_id: uploadResult.public_id,
        width: uploadResult.width,
        height: uploadResult.height
      });
    }

    return images;
  } catch (error) {
    console.error('Imagen generation error:', error);
    throw error;
  }
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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
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
    const { prompt, styles = [], colors = [], size, variations = 3, quality = 'fast', debugMode = false } = JSON.parse(event.body);

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
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        fallback_images: generatePlaceholderImages(3, { wIn: 48, hIn: 24 })
      })
    };
  }
};
