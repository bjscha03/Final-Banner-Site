const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.NETLIFY_DATABASE_URL);

exports.handler = async (event) => {
  try {
    // Get recent order items with file columns
    const items = await sql`
      SELECT id, order_id, file_key, file_url, file_name, web_preview_url, print_ready_url
      FROM order_items 
      ORDER BY id DESC LIMIT 10
    `;
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recent_items: items
      }, null, 2)
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
