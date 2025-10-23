/**
 * Get Saved AI Images Function
 * 
 * Retrieves all saved AI images for a user
 */

const { neon } = require('@neondatabase/serverless');;

const sql = neon(process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || '');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const userId = event.queryStringParameters?.userId;

    if (!userId) {
      return { 
        statusCode: 400, 
        headers, 
        body: JSON.stringify({ error: 'Missing userId parameter' }) 
      };
    }

    console.log(`[Get-Saved-AI-Images] Fetching images for user ${userId}`);

    const images = await sql`
      SELECT 
        id,
        image_url,
        prompt,
        aspect,
        tier,
        generation_id,
        created_at,
        updated_at
      FROM saved_ai_images
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `;

    console.log(`[Get-Saved-AI-Images] Found ${images.length} saved images`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        images: images,
        count: images.length,
      }),
    };
  } catch (error) {
    console.error('[Get-Saved-AI-Images] Error:', error);
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
