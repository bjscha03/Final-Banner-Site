// netlify/functions/ai-generate-banner.js
import { v2 as cloudinary } from 'cloudinary';
import { v4 as uuidv4 } from 'uuid';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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

    // Build enhanced composition prompt
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

    const enhancedPrompt = `Create a high-quality ${dimensionText} banner design: ${prompt}. ${styleText} ${colorText}. Ensure quiet background behind text areas for readability, high contrast elements, professional composition suitable for printing${textLayerPrompt}. No watermarks or signatures.`;

    console.log('Enhanced prompt:', enhancedPrompt);

    // For demo purposes, create a mock response
    // In production, this would call actual AI services
    const mockImageUrl = `https://via.placeholder.com/${Math.min(1024, size.wIn * 50)}x${Math.min(1024, size.hIn * 50)}/4F46E5/FFFFFF?text=${encodeURIComponent(prompt.substring(0, 50))}`;
    
    // Upload mock image to Cloudinary for consistency
    const publicId = `ai-drafts/${uuidv4()}-${Date.now()}`;
    
    console.log('Uploading to Cloudinary...');
    const uploadResult = await cloudinary.uploader.upload(mockImageUrl, {
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
      provider: 'demo'
    });

  } catch (error) {
    console.error('AI generation error:', error);
    return json(500, {
      success: false,
      error: `Generation failed: ${error.message}`
    });
  }
};

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
