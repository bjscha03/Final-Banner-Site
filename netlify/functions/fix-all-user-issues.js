const { neon } = require('@neondatabase/serverless');
const { randomUUID } = require('crypto');

// Neon database connection
const sql = neon(process.env.NETLIFY_DATABASE_URL);

exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    console.log('🔧 FIXING ALL USER ISSUES...');
    
    const results = {
      usersCreated: 0,
      ordersFixed: 0,
      errors: []
    };

    // Step 1: Get all orders with null user_id
    const orphanedOrders = await sql`
      SELECT id, email, created_at FROM orders WHERE user_id IS NULL
    `;

    console.log(`Found ${orphanedOrders.length} orphaned orders`);

    // Step 2: For each orphaned order, create or find user and associate
    for (const order of orphanedOrders) {
      try {
        let userId = null;
        
        // Try to find existing user by email
        const existingUser = await sql`
          SELECT id FROM profiles WHERE email = ${order.email}
        `;

        if (existingUser.length > 0) {
          userId = existingUser[0].id;
          console.log(`Found existing user for ${order.email}: ${userId}`);
        } else {
          // Create new user for this email
          userId = randomUUID();
          
          await sql`
            INSERT INTO profiles (id, email, full_name, is_admin, created_at)
            VALUES (${userId}, ${order.email}, 'User', false, NOW())
          `;
          
          results.usersCreated++;
          console.log(`Created new user for ${order.email}: ${userId}`);
        }

        // Update the order with the user_id
        await sql`
          UPDATE orders SET user_id = ${userId} WHERE id = ${order.id}
        `;
        
        results.ordersFixed++;
        console.log(`Fixed order ${order.id} for user ${userId}`);

      } catch (orderError) {
        console.error(`Error fixing order ${order.id}:`, orderError);
        results.errors.push(`Order ${order.id}: ${orderError.message}`);
      }
    }

    // Step 3: Ensure your specific user exists
    const yourEmail = 'bjscha02@gmail.com';
    const yourUser = await sql`
      SELECT id, email FROM profiles WHERE email = ${yourEmail}
    `;

    if (yourUser.length === 0) {
      const yourUserId = randomUUID();
      await sql`
        INSERT INTO profiles (id, email, username, full_name, is_admin, created_at)
        VALUES (${yourUserId}, ${yourEmail}, 'bjscha03', 'Brandon Schaefer', true, NOW())
      `;
      results.usersCreated++;
      console.log(`Created your user account: ${yourUserId}`);
    } else {
      console.log(`Your user account exists: ${yourUser[0].id}`);
    }

    // Step 4: Get final status
    const finalUsers = await sql`SELECT COUNT(*) as count FROM profiles`;
    const finalOrders = await sql`SELECT COUNT(*) as count FROM orders WHERE user_id IS NOT NULL`;
    const remainingOrphans = await sql`SELECT COUNT(*) as count FROM orders WHERE user_id IS NULL`;

    const summary = {
      ...results,
      finalStats: {
        totalUsers: finalUsers[0].count,
        ordersWithUsers: finalOrders[0].count,
        orphanedOrders: remainingOrphans[0].count
      }
    };

    console.log('🎉 FIX COMPLETED:', summary);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'All user issues fixed successfully!',
        results: summary
      }),
    };

  } catch (error) {
    console.error('Error fixing user issues:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to fix user issues', 
        details: error.message 
      }),
    };
  }
};
