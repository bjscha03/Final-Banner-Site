// netlify/functions/ai-generate-banner.js
const { v2: cloudinary } = require('cloudinary');
const { v4: uuidv4 } = require('uuid');
const { GoogleGenerativeAI } = require('@google/generative-ai');

exports.handler = async (event) => {

  if (event.httpMethod !== "POST") {
    return json(405, { success: false, error: "Method Not Allowed" });
  }

  try {
    const { prompt, styles = [], colors = [], size, variations = 1, quality = 'fast', textLayers = [], seed } = JSON.parse(event.body || '{}');

    // Validate required fields
    if (!prompt || !prompt.trim()) {
      return json(400, { success: false, error: "Prompt is required" });
    }

    if (!size || !size.wIn || !size.hIn) {
      return json(400, { success: false, error: "Banner size is required" });
    }

    // Basic content moderation
    const blockedTerms = ['nsfw', 'nude', 'explicit', 'violence', 'illegal', 'drugs', 'weapons'];
    const lowerPrompt = prompt.toLowerCase();
    if (blockedTerms.some(term => lowerPrompt.includes(term))) {
      return json(400, { success: false, error: "Content not allowed. Please use appropriate language for business banners." });
    }

    console.log('=== AI Banner Generation Debug ===');
    console.log('Prompt:', prompt);
    console.log('Size:', size);
    console.log('Environment variables check:');
    console.log('- REPLICATE_API_TOKEN exists:', !!process.env.REPLICATE_API_TOKEN);
    console.log('- CLOUDINARY_CLOUD_NAME exists:', !!process.env.CLOUDINARY_CLOUD_NAME);
    console.log('- CLOUDINARY_API_KEY exists:', !!process.env.CLOUDINARY_API_KEY);
    console.log('- CLOUDINARY_API_SECRET exists:', !!process.env.CLOUDINARY_API_SECRET);

    // Configure Cloudinary with detailed logging
    try {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });
      console.log('Cloudinary configured successfully');
    } catch (cloudinaryConfigError) {
      console.error('Cloudinary configuration failed:', cloudinaryConfigError);
      return json(500, { success: false, error: `Cloudinary configuration failed: ${cloudinaryConfigError.message}` });
    }

    let imageUrl;
    let provider = 'none';
    let model;
    let aspectRatio;

    // Try Google Imagen first if API key is available
    console.log('=== AI GENERATION DEBUG ===');
    console.log('Environment variables check:');
    console.log('GOOGLE_AI_API_KEY present:', process.env.GOOGLE_AI_API_KEY ? 'Yes (length: ' + process.env.GOOGLE_AI_API_KEY.length + ')' : 'No');
    console.log('Variations requested:', variations);
    console.log('Quality:', quality);
    
    if (process.env.GOOGLE_AI_API_KEY) {
      try {
        console.log('Attempting Google Imagen generation...');
        const enhancedPrompt = buildEnhancedPrompt(prompt, styles, colors, size, textLayers);
        console.log('Enhanced prompt:', enhancedPrompt);
        
        if (variations > 1) {
          // Multiple variations
          const imageUrls = await generateWithImagen(enhancedPrompt, size, quality, variations);
          const uploadedImages = [];
          
          for (let i = 0; i < imageUrls.length; i++) {
            const uploadResult = await cloudinary.uploader.upload(imageUrls[i], {
              folder: 'ai-drafts',
              public_id: `${uuidv4()}-${Date.now()}-${i}`,
              resource_type: 'image'
            });
            uploadedImages.push({
              imageUrl: uploadResult.secure_url,
              publicId: uploadResult.public_id,
              model: quality === 'standard' ? 'imagen-4.0-generate-001' : 'imagen-4.0-fast-generate-001',
              aspectRatio: nearestImagenAR(size.wIn, size.hIn)
            });
          }
          
          return json(200, {
            success: true,
            images: uploadedImages,
            provider: 'google-imagen'
          });
        } else {
          // Single image
          imageUrl = await generateWithImagen(enhancedPrompt, size, quality, 1);
          provider = 'google-imagen';
          model = quality === 'standard' ? 'imagen-4.0-generate-001' : 'imagen-4.0-fast-generate-001';
          aspectRatio = nearestImagenAR(size.wIn, size.hIn);
        }
        
        console.log('Google Imagen generation successful:', imageUrl);
      } catch (imagenError) {
        console.error('Google Imagen generation failed:', imagenError.message);
        console.log('Falling back to enhanced placeholder generation...');
        try {
          if (variations > 1) {
            const placeholderImages = [];
            for (let i = 0; i < variations; i++) {
              const placeholderUrl = await generateEnhancedPlaceholder(prompt, styles, colors, size, i);
              const uploadResult = await cloudinary.uploader.upload(placeholderUrl, {
                folder: 'ai-drafts',
                public_id: `${uuidv4()}-${Date.now()}-${i}`,
                resource_type: 'image'
              });
              placeholderImages.push({
                imageUrl: uploadResult.secure_url,
                publicId: uploadResult.public_id,
                model: 'enhanced-placeholder',
                aspectRatio: nearestImagenAR(size.wIn, size.hIn)
              });
            }
            
            console.log('Enhanced placeholder fallback multiple variations successful:', placeholderImages.length);
            return json(200, {
              success: true,
              images: placeholderImages,
              provider: 'placeholder'
            });
          } else {
            imageUrl = await generateEnhancedPlaceholder(prompt, styles, colors, size);
            provider = 'placeholder';
            console.log('Enhanced placeholder fallback successful:', imageUrl);
          }
        } catch (placeholderError) {
          console.error('Enhanced placeholder generation failed:', placeholderError.message);
          return json(500, { success: false, error: `Both AI and placeholder generation failed: ${placeholderError.message}` });
        }
      }
    } else {
      console.log('No Google AI API key found, using enhanced placeholder...');
      try {
        if (variations > 1) {
          // Multiple placeholder variations
          const placeholderImages = [];
          for (let i = 0; i < variations; i++) {
            const placeholderUrl = await generateEnhancedPlaceholder(prompt, styles, colors, size, i);
            const uploadResult = await cloudinary.uploader.upload(placeholderUrl, {
              folder: 'ai-drafts',
              public_id: `${uuidv4()}-${Date.now()}-${i}`,
              resource_type: 'image'
            });
            placeholderImages.push({
              imageUrl: uploadResult.secure_url,
              publicId: uploadResult.public_id,
              model: 'enhanced-placeholder',
              aspectRatio: nearestImagenAR(size.wIn, size.hIn)
            });
          }
          
          console.log('Enhanced placeholder multiple variations generated:', placeholderImages.length);
          return json(200, {
            success: true,
            images: placeholderImages,
            provider: 'placeholder'
          });
        } else {
          imageUrl = await generateEnhancedPlaceholder(prompt, styles, colors, size);
          provider = 'placeholder';
          console.log('Enhanced placeholder generation successful:', imageUrl);
        }
      } catch (placeholderError) {
        console.error('Enhanced placeholder generation failed:', placeholderError.message);
        return json(500, { success: false, error: `Enhanced placeholder generation failed: ${placeholderError.message}` });
      }
    }

    if (!imageUrl) {
      return json(500, { 
        success: false, 
        error: "No image URL generated from any provider" 
      });
    }

    // Upload to Cloudinary with detailed error handling
    try {
      const publicId = `ai-drafts/${uuidv4()}-${Date.now()}`;
      
      console.log('Uploading to Cloudinary...');
      console.log('Image URL:', imageUrl);
      console.log('Public ID:', publicId);
      
      const uploadResult = await cloudinary.uploader.upload(imageUrl, {
        public_id: publicId,
        folder: 'ai-drafts',
        resource_type: 'image',
        overwrite: false
      });

      console.log('Upload successful:', uploadResult.secure_url);

      return json(200, {
        success: true,
        imageUrl: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        seed: seed || Math.floor(Math.random() * 1000000),
        width: uploadResult.width,
        height: uploadResult.height,
        provider,
        ...(model && { model }),
        ...(aspectRatio && { aspectRatio })
      });
    } catch (uploadError) {
      console.error('Cloudinary upload failed:', uploadError);
      return json(500, { success: false, error: `Upload failed: ${uploadError.message}` });
    }

  } catch (error) {
    console.error('AI generation error:', error);
    return json(500, {
      success: false,
      error: `Generation failed: ${error.message}`
    });
  }
};

function buildEnhancedPrompt(prompt, styles, colors, size, textLayers) {
  // Content classification for better relevance
  const lowerPrompt = prompt.toLowerCase();
  let contentType = 'general';
  let enhancedPrompt = prompt;
  
  // Birthday/Party themes
  if (lowerPrompt.includes('birthday') || lowerPrompt.includes('party') || lowerPrompt.includes('balloon') || lowerPrompt.includes('celebration')) {
    contentType = 'party';
    enhancedPrompt = `colorful party background with balloons, streamers, and festive decorations, ${prompt}`;
  }
  // Sale/Business themes  
  else if (lowerPrompt.includes('sale') || lowerPrompt.includes('grand opening') || lowerPrompt.includes('discount') || lowerPrompt.includes('business')) {
    contentType = 'business';
    enhancedPrompt = `professional business storefront or retail environment, ${prompt}`;
  }
  // Tech/Conference themes
  else if (lowerPrompt.includes('tech') || lowerPrompt.includes('conference') || lowerPrompt.includes('digital') || lowerPrompt.includes('innovation')) {
    contentType = 'tech';
    enhancedPrompt = `modern technology background with digital elements, ${prompt}`;
  }
  // Sports/Fitness themes
  else if (lowerPrompt.includes('sport') || lowerPrompt.includes('fitness') || lowerPrompt.includes('gym') || lowerPrompt.includes('athletic')) {
    contentType = 'sports';
    enhancedPrompt = `dynamic sports or fitness environment, ${prompt}`;
  }
  // Food/Restaurant themes
  else if (lowerPrompt.includes('food') || lowerPrompt.includes('restaurant') || lowerPrompt.includes('cafe') || lowerPrompt.includes('dining')) {
    contentType = 'food';
    enhancedPrompt = `appetizing food photography background, ${prompt}`;
  }
  // Event/Wedding themes
  else if (lowerPrompt.includes('wedding') || lowerPrompt.includes('event') || lowerPrompt.includes('ceremony')) {
    contentType = 'event';
    enhancedPrompt = `elegant event venue or ceremony backdrop, ${prompt}`;
  }

  // Enhanced style processing
  const styleText = styles && styles.length > 0 ? 
    styles.map(style => {
      switch(style) {
        case 'modern': return 'clean, minimalist, contemporary design';
        case 'bold': return 'strong, vibrant, high-impact visual';
        case 'minimal': return 'simple, uncluttered, elegant composition';
        case 'retro': return 'vintage, nostalgic, classic aesthetic';
        case 'kid-friendly': return 'playful, colorful, fun and engaging';
        case 'seasonal': return 'themed for current season, festive atmosphere';
        case 'corporate': return 'professional, business-appropriate, polished';
        default: return style;
      }
    }).join(', ') + ' style' : 'professional style';
  
  // Enhanced color processing
  const colorText = colors && colors.length > 0 ? 
    'featuring ' + colors.map(hex => {
      const colorMap = {
        '#FF0000': 'bright red', '#FF69B4': 'hot pink', '#FFFF00': 'bright yellow',
        '#00FF00': 'bright green', '#0000FF': 'bright blue', '#800080': 'purple',
        '#FFA500': 'orange', '#FFFFFF': 'white', '#000000': 'black',
        '#808080': 'gray', '#1e40af': 'deep blue', '#f3f4f6': 'light gray'
      };
      return colorMap[hex.toUpperCase()] || (hex + ' color');
    }).join(', ') + ' color palette' : '';
  
  // Calculate proper aspect ratio
  const aspectRatio = size.wIn / size.hIn;
  let aspectText = '';
  if (aspectRatio >= 2) {
    aspectText = 'wide horizontal banner format';
  } else if (aspectRatio >= 1.5) {
    aspectText = 'landscape banner format';
  } else if (aspectRatio <= 0.7) {
    aspectText = 'tall vertical banner format';
  } else {
    aspectText = 'square banner format';
  }

  // Build final prompt with better composition instructions
  const finalPrompt = `Professional ${aspectText} banner background: ${enhancedPrompt}. ${styleText}. ${colorText}. Clean composition with space for text overlay, high contrast, suitable for large format printing. No text, logos, or watermarks in the image.`;
  
  console.log('Content type detected:', contentType);
  console.log('Enhanced prompt:', finalPrompt);
  
  return finalPrompt;
}


async function generateWithImagen(prompt, size, quality, variations) {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
  
  // Select model based on quality
  const modelName = quality === 'standard' ? 'imagen-4.0-generate-001' : 'imagen-4.0-fast-generate-001';
  const model = genAI.getGenerativeModel({ model: modelName });
  
  // Calculate nearest supported aspect ratio
  const aspectRatio = nearestImagenAR(size.wIn, size.hIn);
  
  const config = {
    candidateCount: variations,
    // aspectRatio removed - not supported in current API
    // personGeneration removed - not supported in current API
    // sampleImageSize removed - not supported in current API
  };
  
  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: config
    });
    
    const response = await result.response;
    const images = response.candidates || [];
    
    if (!images.length) {
      throw new Error('No images generated');
    }
    
    // Return array of image URLs for multiple variations
    if (variations > 1) {
      return images.map(img => img.content?.parts?.[0]?.inlineData?.data || img.uri).filter(Boolean);
    }
    
    // Return single image URL
    return images[0].content?.parts?.[0]?.inlineData?.data || images[0].uri;
    
  } catch (error) {
    console.error('Google Imagen error:', error);
    throw new Error(`Imagen generation failed: ${error.message}`);
  }
}

// Helper function to map banner dimensions to supported Imagen aspect ratios
function nearestImagenAR(wIn, hIn) {
  const ratio = wIn / hIn;
  
  // Imagen 4 supported aspect ratios
  const supportedRatios = {
    '1:1': 1.0,
    '9:16': 0.5625,
    '16:9': 1.7778,
    '4:3': 1.3333,
    '3:4': 0.75
  };
  
  let closest = '1:1';
  let minDiff = Math.abs(ratio - 1.0);
  
  for (const [ar, value] of Object.entries(supportedRatios)) {
    const diff = Math.abs(ratio - value);
    if (diff < minDiff) {
      minDiff = diff;
      closest = ar;
    }
  }
  
  return closest;
}

async function generateEnhancedPlaceholder(prompt, styles, colors, size, variation = 0) {
  // Enhanced placeholder generation that considers prompt content
  const width = calculateOptimalWidth(size);
  const height = calculateOptimalHeight(size);
  
  // Create different placeholder categories based on prompt content
  const lowerPrompt = prompt.toLowerCase();
  let category = '';
  
  if (lowerPrompt.includes('birthday') || lowerPrompt.includes('party') || lowerPrompt.includes('balloon')) {
    category = 'party';
  } else if (lowerPrompt.includes('business') || lowerPrompt.includes('office') || lowerPrompt.includes('corporate')) {
    category = 'business';
  } else if (lowerPrompt.includes('food') || lowerPrompt.includes('restaurant')) {
    category = 'food';
  } else if (lowerPrompt.includes('nature') || lowerPrompt.includes('outdoor')) {
    category = 'nature';
  } else if (lowerPrompt.includes('tech') || lowerPrompt.includes('digital')) {
    category = 'tech';
  }
  
  // Generate different variations by using different random seeds
  const seed = Date.now() + variation * 1000;
  
  // Use reliable picsum service with different seeds for variations
  const placeholderUrl = `https://picsum.photos/${width}/${height}?random=${seed}`;
  
  console.log(`Generated placeholder (variation ${variation}):`, placeholderUrl);
  return placeholderUrl;
}

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Origin, Content-Type, Accept",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

// Helper functions for proper aspect ratio calculation
function calculateOptimalWidth(size) {
  const aspectRatio = size.wIn / size.hIn;
  const maxDimension = 1280;
  
  let targetWidth, targetHeight;
  if (aspectRatio >= 1) {
    // Landscape or square - limit by width
    targetWidth = Math.min(maxDimension, Math.round(size.wIn * 50));
    targetHeight = Math.round(targetWidth / aspectRatio);
  } else {
    // Portrait - limit by height
    targetHeight = Math.min(maxDimension, Math.round(size.hIn * 50));
    targetWidth = Math.round(targetHeight * aspectRatio);
  }
  
  // Round to nearest multiple of 64 for AI model stability
  return Math.round(targetWidth / 64) * 64;
}

function calculateOptimalHeight(size) {
  const aspectRatio = size.wIn / size.hIn;
  const maxDimension = 1280;
  
  let targetWidth, targetHeight;
  if (aspectRatio >= 1) {
    // Landscape or square - limit by width
    targetWidth = Math.min(maxDimension, Math.round(size.wIn * 50));
    targetHeight = Math.round(targetWidth / aspectRatio);
  } else {
    // Portrait - limit by height
    targetHeight = Math.min(maxDimension, Math.round(size.hIn * 50));
    targetWidth = Math.round(targetHeight * aspectRatio);
  }
  
  // Round to nearest multiple of 64 for AI model stability
  return Math.round(targetHeight / 64) * 64;
}
