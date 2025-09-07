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
    // Check if database URL is available
    if (!process.env.NETLIFY_DATABASE_URL) {
      console.error('NETLIFY_DATABASE_URL not found in environment variables');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Database configuration missing',
          details: 'NETLIFY_DATABASE_URL environment variable not set'
        }),
      };
    }

    const orderData = JSON.parse(event.body);
    console.log('Creating order with data:', orderData);
    console.log('Database URL available:', !!process.env.NETLIFY_DATABASE_URL);

    // Generate UUID for the order
    const orderId = randomUUID();

    // Insert order into database with simplified approach
    console.log('Inserting order with ID:', orderId);
    console.log('Order data:', JSON.stringify(orderData, null, 2));
    console.log('User ID:', orderData.user_id);

    // Handle user_id - CRITICAL FIX: Always use real user email, never guest email
    let finalUserId = null;
    let userEmail = null; // CHANGED: Don't default to guest email

    console.log('🔍 ORDER CREATION DEBUG:');
    console.log('Order data received:', JSON.stringify(orderData, null, 2));

    // STEP 1: If we have user_id, find the user and get their REAL email
    if (orderData.user_id) {
      try {
        console.log('🔍 Looking for user with ID:', orderData.user_id);
        const userCheck = await sql`
          SELECT id, email, username FROM profiles WHERE id = ${orderData.user_id}
        `;

        if (userCheck.length > 0) {
          finalUserId = orderData.user_id;
          userEmail = userCheck[0].email; // CRITICAL: Use the REAL user email
          console.log('✅ User found in profiles table:');
          console.log('   - User ID:', finalUserId);
          console.log('   - Real Email:', userEmail);
          console.log('   - Username:', userCheck[0].username);
        } else {
          console.log('❌ CRITICAL ERROR: User ID not found in profiles table!');
          console.log('   - Provided user_id:', orderData.user_id);
          console.log('   - This user needs to be created in database first');

          // FAIL LOUDLY - don't create order with wrong email
          throw new Error(`User ${orderData.user_id} not found in database. User must be created first.`);
        }
      } catch (userError) {
        console.error('❌ Error checking user profile:', userError);
        throw userError; // Don't continue with invalid user
      }
    }

    // STEP 2: If no user_id provided, check if we have email in order data
    if (!finalUserId && orderData.email) {
      try {
        console.log('🔍 No user_id provided, trying to find user by email:', orderData.email);
        const emailCheck = await sql`
          SELECT id, email FROM profiles WHERE email = ${orderData.email}
        `;
        if (emailCheck.length > 0) {
          finalUserId = emailCheck[0].id;
          userEmail = emailCheck[0].email;
          console.log('✅ User found by email:', finalUserId, userEmail);
        } else {
          console.log('❌ No user found with email:', orderData.email);
        }
      } catch (emailError) {
        console.error('❌ Error checking user by email:', emailError);
      }
    }

    // STEP 3: Final validation - NEVER allow guest email for authenticated users
    if (!finalUserId || !userEmail) {
      console.log('❌ CRITICAL ERROR: Cannot create order without valid user');
      console.log('   - finalUserId:', finalUserId);
      console.log('   - userEmail:', userEmail);
      console.log('   - orderData.user_id:', orderData.user_id);
      console.log('   - orderData.email:', orderData.email);

      // For now, allow guest orders but with proper email
      if (orderData.email && orderData.email !== 'guest@example.com') {
        userEmail = orderData.email;
        console.log('⚠️ Creating guest order with provided email:', userEmail);
      } else {
        throw new Error('Cannot create order: No valid user or email provided');
      }
    }

    console.log('Final user_id for order:', finalUserId);
    console.log('Final email for order:', userEmail);

    const orderResult = await sql`
      INSERT INTO orders (id, user_id, email, subtotal_cents, tax_cents, total_cents, status)
      VALUES (${orderId}, ${finalUserId}, ${userEmail}, ${orderData.subtotal_cents || 0}, ${orderData.tax_cents || 0}, ${orderData.total_cents || 0}, 'paid')
      RETURNING *
    `;

    if (!orderResult || orderResult.length === 0) {
      throw new Error('Failed to create order - no result returned from database');
    }

    const order = orderResult[0];
    console.log('Order created successfully:', order);

    // Insert order items with better error handling - only use columns that exist in database
    if (orderData.items && Array.isArray(orderData.items)) {
      for (const item of orderData.items) {
        console.log('Inserting order item:', JSON.stringify(item, null, 2));
        try {
          await sql`
            INSERT INTO order_items (
              id, order_id, width_in, height_in, quantity, material,
              grommets, rope_feet, line_total_cents
            )
            VALUES (
              ${randomUUID()},
              ${orderId},
              ${item.width_in || 0},
              ${item.height_in || 0},
              ${item.quantity || 1},
              ${item.material || '13oz'},
              ${item.grommets || 'none'},
              ${item.rope_feet || 0},
              ${item.line_total_cents || 0}
            )
          `;
        } catch (itemError) {
          console.error('Error inserting order item:', itemError);
          throw new Error(`Failed to insert order item: ${itemError.message}`);
        }
      }
    }

    console.log('All order items created successfully');

    // Return the order object
    const response = {
      id: orderId,
      user_id: orderData.user_id || null,
      subtotal_cents: orderData.subtotal_cents || 0,
      tax_cents: orderData.tax_cents || 0,
      total_cents: orderData.total_cents || 0,
      status: 'paid',
      currency: orderData.currency || 'USD',
      tracking_number: null,
      tracking_carrier: null,
      created_at: order.created_at || new Date().toISOString(),
      items: orderData.items || []
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error creating order:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to create order', 
        details: error.message 
      }),
    };
  }
};
