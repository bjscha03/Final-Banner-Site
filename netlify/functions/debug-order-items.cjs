const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.NETLIFY_DATABASE_URL);

exports.handler = async (event) => {
  try {
    // Get all columns in order_items table
    const columns = await sql`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'order_items'
      ORDER BY ordinal_position
    `;
    
    // Get recent order items with only columns we know exist
    const items = await sql`
      SELECT id, order_id, file_key, web_preview_url, print_ready_url
      FROM order_items 
      ORDER BY id DESC LIMIT 10
    `;
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        columns: columns.map(c => c.column_name),
        recent_items: items
      }, null, 2)
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message, stack: error.stack })
    };
  }
};
