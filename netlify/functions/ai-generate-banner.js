// netlify/functions/ai-generate-banner.js
import { v2 as cloudinary } from 'cloudinary';
import { v4 as uuidv4 } from 'uuid';

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { success: false, error: "Method Not Allowed" });
  }

  try {
    const { prompt, styles, colors, size, textLayers, seed } = JSON.parse(event.body || '{}');

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

    // Try Replicate first if API token is available
    if (process.env.REPLICATE_API_TOKEN) {
      try {
        console.log('Attempting Replicate generation...');
        const enhancedPrompt = buildEnhancedPrompt(prompt, styles, colors, size, textLayers);
        imageUrl = await generateWithReplicate(enhancedPrompt, size, seed);
        provider = 'replicate';
        console.log('Replicate generation successful:', imageUrl);
      } catch (replicateError) {
        console.error('Replicate generation failed:', replicateError.message);
        console.log('Falling back to placeholder generation...');
        try {
          imageUrl = await generatePlaceholder(prompt, size);
          provider = 'placeholder';
          console.log('Placeholder generation successful:', imageUrl);
        } catch (placeholderError) {
          console.error('Placeholder generation failed:', placeholderError.message);
          return json(500, { success: false, error: `Both AI and placeholder generation failed: ${placeholderError.message}` });
        }
      }
    } else {
      console.log('No Replicate API token found, using placeholder...');
      try {
        imageUrl = await generatePlaceholder(prompt, size);
        provider = 'placeholder';
        console.log('Placeholder generation successful:', imageUrl);
      } catch (placeholderError) {
        console.error('Placeholder generation failed:', placeholderError.message);
        return json(500, { success: false, error: `Placeholder generation failed: ${placeholderError.message}` });
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
        provider
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
  const styleText = styles && styles.length > 0 ? styles.join(', ') + ' style' : 'professional style';
  const colorText = colors && colors.length > 0 ? `using colors ${colors.join(', ')}` : '';
  const dimensionText = `${size.wIn}"x${size.hIn}" banner format`;
  
  let textLayerPrompt = '';
  if (textLayers) {
    const textParts = [];
    if (textLayers.headline) textParts.push(`headline "${textLayers.headline}"`);
    if (textLayers.subheadline) textParts.push(`subheadline "${textLayers.subheadline}"`);
    if (textLayers.cta) textParts.push(`call-to-action "${textLayers.cta}"`);
    if (textParts.length > 0) {
      textLayerPrompt = `, with text elements: ${textParts.join(', ')}`;
    }
  }

  return `Create a high-quality ${dimensionText} banner design: ${prompt}. ${styleText} ${colorText}. Ensure quiet background behind text areas for readability, high contrast elements, professional composition suitable for printing${textLayerPrompt}. No watermarks or signatures.`;
}

async function generateWithReplicate(prompt, size, seed) {
  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b", // SDXL
      input: {
        prompt: prompt,
        width: Math.min(1024, size.wIn * 50),
        height: Math.min(1024, size.hIn * 50),
        num_outputs: 1,
        scheduler: "K_EULER",
        num_inference_steps: 50,
        guidance_scale: 7.5,
        seed: seed || Math.floor(Math.random() * 1000000)
      }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Replicate API error: ${error.detail || response.statusText}`);
  }

  const prediction = await response.json();
  
  // Poll for completion with timeout
  let result = prediction;
  let attempts = 0;
  const maxAttempts = 30; // 30 seconds max for faster fallback
  
  while ((result.status === 'starting' || result.status === 'processing') && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
    
    const pollResponse = await fetch(`https://api.replicate.com/v1/predictions/${result.id}`, {
      headers: {
        'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
      }
    });
    
    if (!pollResponse.ok) {
      throw new Error('Failed to poll prediction status');
    }
    
    result = await pollResponse.json();
  }

  if (result.status === 'failed') {
    throw new Error(`Generation failed: ${result.error}`);
  }

  if (result.status === 'starting' || result.status === 'processing') {
    throw new Error('Generation timed out');
  }

  if (!result.output || !result.output[0]) {
    throw new Error('No output generated');
  }

  return result.output[0];
}

async function generatePlaceholder(prompt, size) {
  const width = Math.min(1024, size.wIn * 50);
  const height = Math.min(1024, size.hIn * 50);
  
  // Use a reliable placeholder service
  return `https://picsum.photos/${width}/${height}?random=${Date.now()}`;
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
