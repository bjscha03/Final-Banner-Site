const { neon } = require('@neondatabase/serverless');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const sql = neon(process.env.NETLIFY_DATABASE_URL);
    
    console.log('Running PayPal columns migration...');
    
    // Add PayPal columns
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS paypal_order_id TEXT`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS paypal_capture_id TEXT`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT`;
    
    // Create indexes
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_paypal_order_id ON orders(paypal_order_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_orders_paypal_capture_id ON orders(paypal_capture_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_orders_customer_name ON orders(customer_name)`;
    
    // Verify columns exist
    const columns = await sql`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'orders' 
        AND column_name IN ('paypal_order_id', 'paypal_capture_id', 'customer_name')
      ORDER BY column_name
    `;
    
    console.log('Migration completed successfully. Added columns:', columns);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        message: 'PayPal columns migration completed successfully',
        columns: columns
      }),
    };
    
  } catch (error) {
    console.error('Migration failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'Migration failed',
        message: error.message
      }),
    };
  }
};
