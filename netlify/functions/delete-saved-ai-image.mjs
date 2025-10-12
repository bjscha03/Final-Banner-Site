/**
 * Delete Saved AI Image Function
 * 
 * Deletes a saved AI image from the user's collection
 */

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || '');

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'DELETE') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { userId, imageId } = JSON.parse(event.body || '{}');

    if (!userId || !imageId) {
      return { 
        statusCode: 400, 
        headers, 
        body: JSON.stringify({ error: 'Missing required fields: userId and imageId' }) 
      };
    }

    console.log(`[Delete-Saved-AI-Image] Deleting image ${imageId} for user ${userId}`);

    // Delete the image (only if it belongs to the user)
    const result = await sql`
      DELETE FROM saved_ai_images
      WHERE id = ${imageId} AND user_id = ${userId}
      RETURNING id
    `;

    if (result.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          error: 'Image not found or does not belong to user',
        }),
      };
    }

    console.log(`[Delete-Saved-AI-Image] Image deleted successfully`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Image deleted successfully',
      }),
    };
  } catch (error) {
    console.error('[Delete-Saved-AI-Image] Error:', error);
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
