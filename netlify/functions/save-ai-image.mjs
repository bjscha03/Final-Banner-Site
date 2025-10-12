/**
 * Save AI Image Function
 * 
 * Saves an AI-generated image to the user's saved images collection
 */

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || '');

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
    const { userId, imageUrl, prompt, aspect, tier, generationId } = JSON.parse(event.body || '{}');

    if (!userId || !imageUrl) {
      return { 
        statusCode: 400, 
        headers, 
        body: JSON.stringify({ error: 'Missing required fields: userId and imageUrl' }) 
      };
    }

    console.log(`[Save-AI-Image] Saving image for user ${userId}`);

    // Check if image is already saved
    const existing = await sql`
      SELECT id FROM saved_ai_images
      WHERE user_id = ${userId} AND image_url = ${imageUrl}
    `;

    if (existing.length > 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Image already saved',
          id: existing[0].id,
        }),
      };
    }

    // Save the image
    const result = await sql`
      INSERT INTO saved_ai_images (user_id, image_url, prompt, aspect, tier, generation_id)
      VALUES (${userId}, ${imageUrl}, ${prompt || null}, ${aspect || null}, ${tier || 'premium'}, ${generationId || null})
      RETURNING id, created_at
    `;

    console.log(`[Save-AI-Image] Image saved successfully:`, result[0].id);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Image saved successfully',
        id: result[0].id,
        createdAt: result[0].created_at,
      }),
    };
  } catch (error) {
    console.error('[Save-AI-Image] Error:', error);
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
