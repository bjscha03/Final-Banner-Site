import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import OpenAI from 'openai';

const sql = neon(process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || '');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const FREE_IMGS_PER_DAY = parseInt(process.env.FREE_IMGS_PER_DAY || '3', 10);
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
  await sql`INSERT INTO user_credits (user_id, credits, last_reset_date) VALUES (${userId}, 0, CURRENT_DATE) ON CONFLICT (user_id) DO NOTHING`;
}

async function getDailyFreeRemaining(userId) {
  await ensureUser(userId);
  const result = await sql`
    SELECT COUNT(*) as count FROM usage_log
    WHERE user_id = ${userId} AND event = 'GEN_SUCCESS'
    AND created_at >= CURRENT_DATE AND (meta->>'used_free')::boolean = true
  `;
  const usedToday = parseInt(result[0]?.count || '0', 10);
  return Math.max(0, FREE_IMGS_PER_DAY - usedToday);
}

async function getPaidCredits(userId) {
  await ensureUser(userId);
  const result = await sql`SELECT credits FROM user_credits WHERE user_id = ${userId}`;
  return result[0]?.credits || 0;
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
    public_id: `preview_${Date.now()}`,
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

export const handler = async (event) => {
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
    const { prompt, aspect, style = {}, userId, tier: requestedTier = 'premium' } = JSON.parse(event.body || '{}');

    if (!prompt || !aspect || !userId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    console.log(`[AI-Preview] User ${userId}: ${prompt.substring(0, 50)}...`);

    const size = '768x768';
    const promptHash = generatePromptHash(prompt, aspect, style, size);

    // Check cache
    const cached = await sql`
      SELECT id, image_urls, tier, cost_usd FROM generations
      WHERE prompt_hash = ${promptHash} AND aspect = ${aspect} AND size = ${size}
      ORDER BY created_at DESC LIMIT 1
    `;

    if (cached.length > 0) {
      console.log(`[AI-Preview] Cache HIT!`);
      await sql`INSERT INTO usage_log (user_id, event, meta) VALUES (${userId}, 'CACHE_HIT', ${JSON.stringify({ genId: cached[0].id, cost: 0 })})`;
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          urls: cached[0].image_urls,
          tier: cached[0].tier,
          cached: true,
          genId: cached[0].id,
          cost: 0,
        }),
      };
    }

    console.log(`[AI-Preview] Cache MISS`);

    // Check credits
    const freeRemaining = await getDailyFreeRemaining(userId);
    const paidCredits = await getPaidCredits(userId);

    if (freeRemaining < 1 && paidCredits < 1) {
      return {
        statusCode: 402,
        headers,
        body: JSON.stringify({
          code: 'INSUFFICIENT_CREDITS',
          message: `Insufficient credits. You have ${paidCredits} paid credits and ${freeRemaining} free images remaining today.`,
        }),
      };
    }

    const useFree = freeRemaining >= 1;

    // Enforce tier
    const tierResult = await enforceTierDowngrade(requestedTier, userId);
    const finalTier = tierResult.tier;

    console.log(`[AI-Preview] Tier: ${finalTier}`);

    // Generate
    let imageUrl;
    let cost;
    
    if (finalTier === 'premium') {
      imageUrl = await generateWithOpenAI(prompt, aspect);
      cost = 0.080;
    } else {
      imageUrl = await generateWithFal(prompt, aspect);
      cost = 0.003;
    }

    console.log(`[AI-Preview] Generated, uploading...`);

    // Upload to Cloudinary
    const uploaded = await uploadToCloudinary(imageUrl);

    // Save to DB
    const genId = generateId();
    await sql`
      INSERT INTO generations (id, user_id, prompt, prompt_hash, aspect, size, style, tier, image_urls, cost_usd)
      VALUES (${genId}, ${userId}, ${prompt}, ${promptHash}, ${aspect}, ${size}, ${JSON.stringify(style)}, ${finalTier}, ${JSON.stringify([uploaded.url])}, ${cost})
    `;

    // Debit credits if not using free
    if (!useFree) {
      await sql`UPDATE user_credits SET credits = credits - 1 WHERE user_id = ${userId}`;
    }

    // Log usage
    await sql`INSERT INTO usage_log (user_id, event, meta) VALUES (${userId}, 'GEN_SUCCESS', ${JSON.stringify({ genId, tier: finalTier, cost, used_free: useFree })})`;

    console.log(`[AI-Preview] Success!`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        urls: [uploaded.url],
        tier: finalTier,
        cached: false,
        genId,
        cost,
      }),
    };
  } catch (error) {
    console.error('[AI-Preview] Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error', message: error.message }),
    };
  }
};
