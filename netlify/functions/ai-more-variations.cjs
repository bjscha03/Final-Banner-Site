/**
 * AI More Variations Function
 * 
 * Generates 2 additional variations of an AI-generated image
 * Uses the same prompt and settings as the original generation
 */

const { neon } = require('@neondatabase/serverless');;
const crypto = require('crypto');
const { v2 as cloudinary  } = require('cloudinary');
const OpenAI = require('openai');

const sql = neon(process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || '');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const FREE_CREDITS_INITIAL = 3;
const MONTHLY_SOFT_CAP = parseFloat(process.env.IMG_MONTHLY_SOFT_CAP_USD || '100');

const ASPECT_TO_SIZE_MAP = {
  '1:1': '1024x1024',
  '4:3': '1024x1024',
  '3:2': '1792x1024',
  '16:9': '1792x1024',
  '2:3': '1024x1792',
};

function normalizePrompt(prompt) {
  const noiseWords = ['banner', 'background', 'image', 'for', 'a', 'an', 'the'];
  return prompt.toLowerCase().trim().split(/\s+/)
    .filter(word => !noiseWords.includes(word)).sort().join(' ');
}

function generatePromptHash(prompt, aspect, style = {}, size = '768x768') {
  const normalized = normalizePrompt(prompt);
  const styleStr = JSON.stringify(style);
  const combined = `${normalized}|${aspect}|${styleStr}|${size}`;
  return crypto.createHash('sha256').update(combined).digest('hex');
}

function generateId() {
  return `gen_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

async function ensureUser(userId, email = null) {
  await sql`INSERT INTO users (id, email) VALUES (${userId}, ${email}) ON CONFLICT (id) DO NOTHING`;
  await sql`INSERT INTO user_credits (user_id, credits) VALUES (${userId}, 0) ON CONFLICT (user_id) DO NOTHING`;
}

async function getFreeCreditsRemaining(userId) {
  await ensureUser(userId);
  const result = await sql`
    SELECT COUNT(*) as count FROM usage_log
    WHERE user_id = ${userId} 
      AND event = 'GEN_SUCCESS'
      AND (meta->>'used_free')::boolean = true
  `;
  const usedFree = parseInt(result[0]?.count || '0', 10);
  return Math.max(0, FREE_CREDITS_INITIAL - usedFree);
}

async function getPaidCredits(userId) {
  await ensureUser(userId);
  const result = await sql`SELECT credits FROM user_credits WHERE user_id = ${userId}`;
  return parseInt(result[0]?.credits || '0', 10);
}

async function deductCredit(userId) {
  const freeRemaining = await getFreeCreditsRemaining(userId);
  
  if (freeRemaining > 0) {
    // Use free credit
    return { usedFree: true, tier: 'premium' };
  }
  
  // Use paid credit
  const paidCredits = await getPaidCredits(userId);
  if (paidCredits < 1) {
    throw new Error('INSUFFICIENT_CREDITS');
  }
  
  await sql`
    UPDATE user_credits
    SET credits = credits - 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ${userId}
  `;
  
  return { usedFree: false, tier: 'premium' };
}

async function getMonthlySpending(userId) {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const result = await sql`
    SELECT COALESCE(SUM((meta->>'cost')::numeric), 0) as total FROM usage_log
    WHERE user_id = ${userId} AND event = 'GEN_SUCCESS' AND created_at >= ${startOfMonth.toISOString()}
  `;
  return parseFloat(result[0]?.total || '0');
}

async function enforceTierDowngrade(requestedTier, userId) {
  const currentSpend = await getMonthlySpending(userId);
  if (currentSpend >= MONTHLY_SOFT_CAP && requestedTier === 'premium') {
    return { tier: 'standard', downgraded: true };
  }
  return { tier: requestedTier, downgraded: false };
}

async function uploadToCloudinary(imageUrl) {
  const result = await cloudinary.uploader.upload(imageUrl, {
    folder: 'ai-generated-banners/previews',
    public_id: `preview_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    resource_type: 'image',
  });
  return { url: result.secure_url, publicId: result.public_id };
}

async function generateWithOpenAI(prompt, aspect) {
  const size = ASPECT_TO_SIZE_MAP[aspect] || '1792x1024';
  const quality = process.env.DALLE_QUALITY || 'hd';
  
  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size,
    quality,
    response_format: 'url',
  });
  
  return response.data[0]?.url;
}

async function generateWithFal(prompt, aspect) {
  const FAL_API_KEY = process.env.FAL_API_KEY;
  if (!FAL_API_KEY) throw new Error('FAL_API_KEY not configured');
  
  const aspectMap = {
    '1:1': 'square', '4:3': 'square', '3:2': 'landscape_16_9',
    '16:9': 'landscape_16_9', '2:3': 'portrait_16_9',
  };
  const aspectRatio = aspectMap[aspect] || 'landscape_16_9';
  
  const response = await fetch(`https://fal.run/fal-ai/flux-schnell`, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      image_size: aspectRatio,
      num_inference_steps: 4,
      num_images: 1,
      enable_safety_checker: true,
    }),
  });
  
  if (!response.ok) throw new Error(`Fal.ai error: ${response.status}`);
  const data = await response.json();
  return data.images?.[0]?.url;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { prompt, aspect, style = {}, count = 2, userId, tier: requestedTier = 'premium' } = JSON.parse(event.body || '{}');

    if (!prompt || !aspect || !userId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    console.log(`[AI-More-Variations] User ${userId}: Generating ${count} variations`);

    // Check and deduct credit (1 credit for 2 more variations)
    let creditInfo;
    try {
      creditInfo = await deductCredit(userId);
    } catch (error) {
      if (error.message === 'INSUFFICIENT_CREDITS') {
        return {
          statusCode: 402,
          headers,
          body: JSON.stringify({
            error: 'Insufficient credits',
            code: 'INSUFFICIENT_CREDITS',
            message: 'You need more credits to generate additional variations.',
          }),
        };
      }
      throw error;
    }

    // Enforce tier downgrade if needed
    const { tier, downgraded } = await enforceTierDowngrade(requestedTier, userId);
    
    if (downgraded) {
      console.log(`[AI-More-Variations] Tier downgraded to ${tier} due to monthly cap`);
    }

    // Generate images in parallel to avoid timeout
    console.log(`[AI-More-Variations] Generating ${count} images in parallel...`);
    
    const generateImage = async (index) => {
      try {
        let imageUrl;
        let cost = 0;
        
        // SPEED OPTIMIZATION: Use Fal.ai for variations (much faster than DALL-E 3)
        // Fal.ai Flux Schnell generates in ~2-3 seconds vs DALL-E 3's ~10-15 seconds
        // This makes "Generate 2 More Options" significantly faster
        if (tier === 'standard' || process.env.USE_FAL_FOR_VARIATIONS === 'true') {
          // Use Fal.ai for fast generation
          imageUrl = await generateWithFal(prompt, aspect);
          cost = 0.003; // Fal.ai cost
        } else {
          // Use DALL-E 3 for premium (slower but higher quality)
          imageUrl = await generateWithOpenAI(prompt, aspect);
          cost = 0.04; // DALL-E 3 HD cost
        }
        
        // Upload to Cloudinary
        const { url } = await uploadToCloudinary(imageUrl);
        console.log(`[AI-More-Variations] Generated image ${index + 1}/${count}: ${url}`);
        return { url, cost };
      } catch (error) {
        console.error(`[AI-More-Variations] Failed to generate image ${index + 1}:`, error);
        return null;
      }
    };
    
    // Generate all images in parallel
    const results = await Promise.all(
      Array.from({ length: count }, (_, i) => generateImage(i))
    );
    
    // Filter out failed generations
    const successfulResults = results.filter(r => r !== null);
    const generatedUrls = successfulResults.map(r => r.url);
    const costs = successfulResults.map(r => r.cost);

    if (generatedUrls.length === 0) {
      throw new Error('Failed to generate any images');
    }

    // Create generation record
    const genId = generateId();
    const size = '768x768';
    const promptHash = generatePromptHash(prompt, aspect, style, size);
    const totalCost = costs.reduce((sum, c) => sum + c, 0);

    await sql`
      INSERT INTO generations (
        id, user_id, prompt, prompt_hash, aspect, size, style,
        image_urls, tier, cost_usd, cached
      ) VALUES (
        ${genId}, ${userId}, ${prompt}, ${promptHash}, ${aspect}, ${size},
        ${JSON.stringify(style)}, ${JSON.stringify(generatedUrls)}, ${tier},
        ${totalCost}, false
      )
    `;

    // Log usage
    await sql`
      INSERT INTO usage_log (user_id, event, meta)
      VALUES (
        ${userId},
        'GEN_SUCCESS',
        ${JSON.stringify({
          genId,
          tier,
          cost: totalCost,
          used_free: creditInfo.usedFree,
          variation_count: generatedUrls.length,
        })}
      )
    `;

    console.log(`[AI-More-Variations] Success! Generated ${generatedUrls.length} variations for user ${userId}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        urls: generatedUrls,
        tier,
        cached: false,
        genId,
        cost: totalCost,
        usedFree: creditInfo.usedFree,
      }),
    };
  } catch (error) {
    console.error('[AI-More-Variations] Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message,
      }),
    };
  }
};
