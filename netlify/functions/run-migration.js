const { neon } = require('@neondatabase/serverless');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Database not configured' })
      };
    }

    const sql = neon(dbUrl);

    // Add 'shipped' status to orders table check constraint
    // Drop the existing check constraint
    await sql`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check`;

    // Add the new check constraint that includes 'shipped'
    await sql`ALTER TABLE orders ADD CONSTRAINT orders_status_check
      CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'shipped'))`;

    // Update any existing orders with tracking numbers to have 'shipped' status
    const shippedOrdersUpdated = await sql`
      UPDATE orders
      SET status = 'shipped'
      WHERE tracking_number IS NOT NULL
        AND tracking_number != ''
        AND status = 'paid'
      RETURNING id
    `;

    // Add order_number column to orders table
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number VARCHAR(20) UNIQUE`;

    // Create index for performance
    await sql`CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number)`;

    // Add contact_messages table for contact form system
    await sql`
      CREATE TABLE IF NOT EXISTS contact_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(120) NOT NULL,
        email VARCHAR(255) NOT NULL,
        subject VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    // Create indexes for contact messages
    await sql`CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at ON contact_messages(created_at)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_contact_messages_email ON contact_messages(email)`;

    // Update existing orders with order numbers (backfill)
    // First get all orders without order numbers
    const ordersWithoutNumbers = await sql`
      SELECT id FROM orders WHERE order_number IS NULL ORDER BY created_at
    `;

    let orderNumber = 100000;
    let updateCount = 0;

    for (const order of ordersWithoutNumbers) {
      await sql`
        UPDATE orders
        SET order_number = ${orderNumber.toString().padStart(6, '0')}
        WHERE id = ${order.id}
      `;
      orderNumber++;
      updateCount++;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Migration completed successfully',
        ordersUpdated: updateCount,
        shippedOrdersUpdated: shippedOrdersUpdated.length
      })
    };

  } catch (error) {
    console.error('Migration error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Migration failed',
        details: error.message
      })
    };
  }
};
