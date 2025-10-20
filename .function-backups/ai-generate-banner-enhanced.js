
async function generateWithImagen(prompt, size, quality, variations) {
  console.log('=== IMAGEN GENERATION START ===');
  console.log('Prompt:', prompt);
  console.log('Size:', size);
  console.log('Quality:', quality);
  console.log('Variations:', variations);
  
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
  
  // Select model based on quality
  const modelName = quality === 'standard' ? 'imagen-4.0-generate-001' : 'imagen-4.0-fast-generate-001';
  console.log('Using model:', modelName);
  
  const model = genAI.getGenerativeModel({ model: modelName });
  
  // Calculate nearest supported aspect ratio
  const aspectRatio = nearestImagenAR(size.wIn, size.hIn);
  console.log('Aspect ratio:', aspectRatio);
  
  const config = {
    numberOfImages: variations,
    aspectRatio,
    personGeneration: 'dont_allow',
    ...(modelName === 'imagen-4.0-generate-001' ? { sampleImageSize: '2K' } : {})
  };
  
  console.log('Generation config:', config);
  
  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: config
    });
    
    const response = await result.response;
    console.log('Response received:', response ? 'Yes' : 'No');
    
    const images = response.candidates || [];
    console.log('Images generated:', images.length);
    
    if (!images.length) {
      throw new Error('No images generated');
    }
    
    // Return array of image URLs for multiple variations
    if (variations > 1) {
      const imageUrls = images.map(img => img.content?.parts?.[0]?.inlineData?.data || img.uri).filter(Boolean);
      console.log('Multiple image URLs extracted:', imageUrls.length);
      return imageUrls;
    }
    
    // Return single image URL
    const singleUrl = images[0].content?.parts?.[0]?.inlineData?.data || images[0].uri;
    console.log('Single image URL extracted:', singleUrl ? 'Yes' : 'No');
    return singleUrl;
    
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

async function generatePlaceholder(prompt, size) {
  // Enhanced placeholder generation with proper aspect ratio
  const width = calculateOptimalWidth(size);
  const height = calculateOptimalHeight(size);
  
  // Use a reliable placeholder service with better images
  const placeholderUrl = `https://picsum.photos/${width}/${height}?random=${Math.floor(Math.random() * 1000)}`;
  
  console.log('Generated placeholder URL:', placeholderUrl);
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
