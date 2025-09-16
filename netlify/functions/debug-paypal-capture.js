const { neon } = require('@neondatabase/serverless');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    console.log('=== PayPal Capture Debug ===');
    console.log('Environment check:', {
      hasDatabase: !!process.env.NETLIFY_DATABASE_URL,
      databaseUrlLength: process.env.NETLIFY_DATABASE_URL?.length,
      hasPayPalFeature: !!process.env.FEATURE_PAYPAL,
      paypalFeature: process.env.FEATURE_PAYPAL,
      paypalEnv: process.env.PAYPAL_ENV,
      hasClientId: !!process.env.PAYPAL_CLIENT_ID_SANDBOX,
      hasSecret: !!process.env.PAYPAL_SECRET_SANDBOX
    });

    // Test database connection
    if (!process.env.NETLIFY_DATABASE_URL) {
      throw new Error('NETLIFY_DATABASE_URL not configured');
    }

    const sql = neon(process.env.NETLIFY_DATABASE_URL);
    
    // Test database schema
    console.log('Testing database schema...');
    const schemaTest = await sql`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'orders' 
      ORDER BY ordinal_position
    `;
    
    console.log('Orders table schema:', schemaTest);

    const orderItemsSchema = await sql`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'order_items' 
      ORDER BY ordinal_position
    `;
    
    console.log('Order items table schema:', orderItemsSchema);

    // Test a simple insert (we'll rollback)
    console.log('Testing order insert...');

    // Import randomUUID at the top level
    const { randomUUID } = require('crypto');
    const testOrderId = randomUUID();
    const testEmail = 'test@example.com';

    console.log('Generated test UUID:', testOrderId);
    console.log('UUID type:', typeof testOrderId);
    console.log('UUID length:', testOrderId.length);

    try {
      // First, let's test if we can insert with a hardcoded UUID
      const hardcodedUUID = '550e8400-e29b-41d4-a716-446655440000';
      console.log('Testing with hardcoded UUID:', hardcodedUUID);

      const testResult = await sql`
        INSERT INTO orders (
          id, user_id, email, subtotal_cents, tax_cents, total_cents, status
        )
        VALUES (
          ${hardcodedUUID}, null, ${testEmail}, 1000, 60, 1060, 'paid'
        )
        RETURNING *
      `;

      console.log('Test insert successful:', testResult);

      // Clean up test order
      await sql`DELETE FROM orders WHERE id = ${hardcodedUUID}`;
      console.log('Test order cleaned up');

    } catch (insertError) {
      console.error('Test insert failed:', insertError);
      console.error('Error details:', {
        message: insertError.message,
        code: insertError.code,
        detail: insertError.detail,
        hint: insertError.hint
      });

      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'TEST_INSERT_FAILED',
          details: insertError.message,
          errorCode: insertError.code,
          errorDetail: insertError.detail
        })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        message: 'PayPal capture debug completed successfully',
        ordersSchema: schemaTest,
        orderItemsSchema: orderItemsSchema
      })
    };

  } catch (error) {
    console.error('PayPal capture debug error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'DEBUG_FAILED',
        message: error.message,
        stack: error.stack
      })
    };
  }
};
