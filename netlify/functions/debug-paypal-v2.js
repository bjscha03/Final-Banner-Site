const { neon } = require('@neondatabase/serverless');
const { randomUUID } = require('crypto');

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
    console.log('=== PayPal Debug V2 ===');
    
    // Environment check
    const envCheck = {
      hasDatabase: !!process.env.NETLIFY_DATABASE_URL,
      databaseUrlLength: process.env.NETLIFY_DATABASE_URL?.length,
      hasPayPalFeature: !!process.env.FEATURE_PAYPAL,
      paypalFeature: process.env.FEATURE_PAYPAL,
      paypalEnv: process.env.PAYPAL_ENV,
      hasClientId: !!process.env.PAYPAL_CLIENT_ID_SANDBOX,
      hasSecret: !!process.env.PAYPAL_SECRET_SANDBOX,
      nodeVersion: process.version,
      timestamp: new Date().toISOString()
    };
    
    console.log('Environment check:', envCheck);

    // Test database connection
    if (!process.env.NETLIFY_DATABASE_URL) {
      throw new Error('NETLIFY_DATABASE_URL not configured');
    }

    const sql = neon(process.env.NETLIFY_DATABASE_URL);
    
    // Test database schema
    console.log('Testing database schema...');
    const schemaTest = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'orders' 
      ORDER BY ordinal_position
    `;
    
    console.log('Orders table schema:', schemaTest);

    // Test UUID generation
    const testUUID = randomUUID();
    console.log('Generated UUID:', testUUID);
    console.log('UUID format valid:', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(testUUID));

    // Test simple database insert
    console.log('Testing database insert...');
    
    try {
      const insertResult = await sql`
        INSERT INTO orders (
          id, user_id, email, subtotal_cents, tax_cents, total_cents, status
        )
        VALUES (
          ${testUUID}, null, 'debug@test.com', 1000, 60, 1060, 'paid'
        )
        RETURNING id, email, total_cents, status, created_at
      `;
      
      console.log('Insert successful:', insertResult);
      
      // Clean up
      await sql`DELETE FROM orders WHERE id = ${testUUID}`;
      console.log('Cleanup successful');
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          message: 'PayPal debug V2 completed successfully',
          environment: envCheck,
          schema: schemaTest,
          testInsert: 'SUCCESS',
          testUUID: testUUID
        })
      };
      
    } catch (insertError) {
      console.error('Insert failed:', insertError);
      
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'INSERT_FAILED',
          message: insertError.message,
          code: insertError.code,
          detail: insertError.detail,
          environment: envCheck,
          schema: schemaTest,
          testUUID: testUUID
        })
      };
    }

  } catch (error) {
    console.error('Debug V2 error:', error);
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
