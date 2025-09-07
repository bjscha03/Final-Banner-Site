const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.NETLIFY_DATABASE_URL);

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

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
    console.log('🔧 STARTING USER-ORDER REPAIR PROCESS...');
    
    const results = {
      ordersFound: 0,
      ordersRepaired: 0,
      usersCreated: 0,
      errors: []
    };

    // STEP 1: Find all orders with guest@example.com email
    const guestOrders = await sql`
      SELECT id, user_id, email, created_at 
      FROM orders 
      WHERE email = 'guest@example.com'
      ORDER BY created_at DESC
    `;

    results.ordersFound = guestOrders.length;
    console.log(`Found ${guestOrders.length} orders with guest email`);

    if (guestOrders.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'No orders need repair',
          results
        }),
      };
    }

    // STEP 2: For each guest order, try to find the real user
    for (const order of guestOrders) {
      try {
        console.log(`Processing order ${order.id}...`);
        
        let realUser = null;
        
        // If order has a user_id, try to find that user
        if (order.user_id) {
          const userCheck = await sql`
            SELECT id, email FROM profiles WHERE id = ${order.user_id}
          `;
          
          if (userCheck.length > 0) {
            realUser = userCheck[0];
            console.log(`Found user for order ${order.id}: ${realUser.email}`);
          } else {
            console.log(`User ID ${order.user_id} not found in profiles table`);
          }
        }

        // If we found a real user, update the order
        if (realUser) {
          await sql`
            UPDATE orders 
            SET email = ${realUser.email}
            WHERE id = ${order.id}
          `;
          
          results.ordersRepaired++;
          console.log(`✅ Repaired order ${order.id}: ${order.email} → ${realUser.email}`);
        } else {
          console.log(`❌ Could not find real user for order ${order.id}`);
          results.errors.push(`Order ${order.id}: No matching user found`);
        }

      } catch (orderError) {
        console.error(`Error processing order ${order.id}:`, orderError);
        results.errors.push(`Order ${order.id}: ${orderError.message}`);
      }
    }

    // STEP 3: Ensure your specific user exists with correct email
    const yourEmail = 'bjscha02@gmail.com';
    const yourUser = await sql`
      SELECT id, email FROM profiles WHERE email = ${yourEmail}
    `;

    if (yourUser.length === 0) {
      const yourUserId = crypto.randomUUID();
      await sql`
        INSERT INTO profiles (id, email, username, full_name, is_admin, created_at)
        VALUES (${yourUserId}, ${yourEmail}, 'bjscha03', 'Brandon Schaefer', true, NOW())
      `;
      results.usersCreated++;
      console.log(`Created your user account: ${yourUserId}`);
    } else {
      console.log(`Your user account exists: ${yourUser[0].id}`);
    }

    // STEP 4: Get final status
    const remainingGuestOrders = await sql`
      SELECT COUNT(*) as count FROM orders WHERE email = 'guest@example.com'
    `;
    
    const totalOrders = await sql`
      SELECT COUNT(*) as count FROM orders
    `;

    const summary = {
      ...results,
      finalStats: {
        totalOrders: totalOrders[0].count,
        remainingGuestOrders: remainingGuestOrders[0].count,
        repairSuccess: results.ordersRepaired > 0
      }
    };

    console.log('🎉 REPAIR COMPLETED:', summary);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: `Repaired ${results.ordersRepaired} out of ${results.ordersFound} orders`,
        results: summary
      }),
    };

  } catch (error) {
    console.error('Error repairing user orders:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to repair user orders', 
        details: error.message 
      }),
    };
  }
};
