
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
    numberOfImages: variations,
    aspectRatio,
    personGeneration: 'dont_allow',
    ...(modelName === 'imagen-4.0-generate-001' ? { sampleImageSize: '2K' } : {})
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
  
  // Use Unsplash for more relevant placeholder images
  let placeholderUrl;
  if (category) {
    placeholderUrl = `https://source.unsplash.com/${width}x${height}/?${category}&sig=${seed}`;
  } else {
    placeholderUrl = `https://source.unsplash.com/${width}x${height}/?abstract,background&sig=${seed}`;
  }
  
  console.log(`Generated enhanced placeholder (variation ${variation}):`, placeholderUrl);
  return placeholderUrl;
}

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
  
  // Round to nearest multiple of 64 for stability
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
  
  // Round to nearest multiple of 64 for stability
  return Math.round(targetHeight / 64) * 64;
}
