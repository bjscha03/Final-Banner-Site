const { neon } = require('@neondatabase/serverless');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  try {
    const DATABASE_URL = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
    if (!DATABASE_URL) throw new Error('DATABASE_URL not configured');

    const sql = neon(DATABASE_URL);
    
    // Add file_url column
    await sql`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS file_url TEXT`;
    
    console.log('Added file_url column to order_items');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: 'Added file_url column to order_items' })
    };
  } catch (error) {
    console.error('Error:', error);
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ error: error.message }) 
    };
  }
};
