const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.NETLIFY_DATABASE_URL);

exports.handler = async (event) => {
  try {
    // Check if file_url column exists
    const columns = await sql`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'order_items' AND column_name = 'file_url'
    `;
    
    // Get recent order items
    const items = await sql`
      SELECT id, order_id, file_key, file_url, is_pdf, web_preview_url, print_ready_url
      FROM order_items 
      ORDER BY id DESC LIMIT 10
    `;
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_url_column_exists: columns.length > 0,
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
