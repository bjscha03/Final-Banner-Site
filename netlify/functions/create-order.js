const { neon } = require('@neondatabase/serverless');
const { randomUUID } = require('crypto');

// Feature flag support for new pricing logic
const getFeatureFlags = () => {
  return {
    freeShipping: process.env.FEATURE_FREE_SHIPPING === '1',
    minOrderFloor: process.env.FEATURE_MIN_ORDER_FLOOR === '1',
    minOrderCents: parseInt(process.env.MIN_ORDER_CENTS || '2000', 10),
    shippingMethodLabel: process.env.SHIPPING_METHOD_LABEL || 'Free Next-Day Air'
  };
};

const computeTotals = (items, taxRate, opts) => {
  const raw = items.reduce((sum, i) => sum + i.line_total_cents, 0);
  const adjusted = Math.max(raw, opts.minFloorCents || 0);
  const minAdj = Math.max(0, adjusted - raw);

  const shipping_cents = opts.freeShipping ? 0 : 0;
  const tax_cents = Math.round(adjusted * taxRate);
  const total_cents = adjusted + tax_cents + shipping_cents;

  return {
    raw_subtotal_cents: raw,
    adjusted_subtotal_cents: adjusted,
    min_order_adjustment_cents: minAdj,
    shipping_cents,
    tax_cents,
    total_cents,
  };
};

// Send order confirmation email by calling notify-order function
async function sendOrderConfirmationEmail(orderId) {
  try {
    console.log('Sending order confirmation email for order:', orderId);

    const response = await fetch(`${process.env.URL || 'https://bannersonthefly.com'}/.netlify/functions/notify-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ orderId }),
    });

    const result = await response.json();

    if (response.ok && result.ok) {
      return { ok: true, id: result.id };
    } else {
      console.error('Email notification failed:', result);
      return { ok: false, error: result.error || 'Email send failed' };
    }
  } catch (error) {
    console.error('Error calling notify-order function:', error);
    return { ok: false, error: error.message || 'Email send failed' };
  }
}

// Neon database connection
const sql = neon(process.env.VITE_DATABASE_URL || process.env.NETLIFY_DATABASE_URL);

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

  let orderData = null;

  try {
    // Check if database URL is available
    const databaseUrl = process.env.VITE_DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
    if (!databaseUrl) {
      console.error('Database URL not found in environment variables');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Database configuration missing',
          details: 'VITE_DATABASE_URL or NETLIFY_DATABASE_URL environment variable not set'
        }),
      };
    }

    orderData = JSON.parse(event.body);
    console.log('Creating order with data:', orderData);
    console.log('Database URL available:', !!databaseUrl);

    // Apply feature flag pricing logic if enabled
    const flags = getFeatureFlags();
    if (flags.freeShipping || flags.minOrderFloor) {
      console.log('🏁 Feature flags enabled:', flags);

      const taxRate = 0.06; // 6% tax rate
      const pricingOptions = {
        freeShipping: flags.freeShipping,
        minFloorCents: flags.minOrderFloor ? flags.minOrderCents : 0,
        shippingMethodLabel: flags.shippingMethodLabel
      };

      // Recalculate totals with feature flags
      const recalculatedTotals = computeTotals(orderData.items || [], taxRate, pricingOptions);

      // Log pricing calculation
      console.info('pricing', {
        orderId,
        raw_subtotal_cents: recalculatedTotals.raw_subtotal_cents,
        adjusted_subtotal_cents: recalculatedTotals.adjusted_subtotal_cents,
        min_order_adjustment_cents: recalculatedTotals.min_order_adjustment_cents,
        shipping_cents: recalculatedTotals.shipping_cents,
        tax_cents: recalculatedTotals.tax_cents,
        total_cents: recalculatedTotals.total_cents,
        timestamp: new Date().toISOString()
      });

      // Update order data with recalculated totals
      orderData.subtotal_cents = recalculatedTotals.adjusted_subtotal_cents;
      orderData.tax_cents = recalculatedTotals.tax_cents;
      orderData.total_cents = recalculatedTotals.total_cents;
      orderData.min_order_adjustment_cents = recalculatedTotals.min_order_adjustment_cents;
      orderData.shipping_cents = recalculatedTotals.shipping_cents;

      console.log('✅ Updated order totals with feature flags:', {
        subtotal_cents: orderData.subtotal_cents,
        tax_cents: orderData.tax_cents,
        total_cents: orderData.total_cents,
        min_order_adjustment_cents: orderData.min_order_adjustment_cents
      });
    }

    // Generate UUID for the order
    const orderId = randomUUID();

    // Order number functionality removed - using UUID as primary identifier

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

    // STEP 3: Final validation - ALWAYS ensure we have an email
    if (!userEmail) {
      console.log('❌ No userEmail found, checking orderData.email');
      console.log('   - finalUserId:', finalUserId);
      console.log('   - userEmail:', userEmail);
      console.log('   - orderData.user_id:', orderData.user_id);
      console.log('   - orderData.email:', orderData.email);

      // Use provided email or fail
      if (orderData.email && orderData.email !== 'guest@example.com') {
        userEmail = orderData.email;
        console.log('✅ Using provided email for order:', userEmail);
      } else {
        throw new Error('Cannot create order: No valid email provided. Email is required for all orders.');
      }
    }

    // Ensure we have a valid email (allow guest emails with timestamp)
    if (!userEmail || userEmail === 'guest@example.com') {
      throw new Error('Cannot create order: Valid email address is required');
    }

    console.log('Final user_id for order:', finalUserId);
    console.log('Final email for order:', userEmail);

    const orderResult = await sql`
      INSERT INTO orders (id, user_id, email, subtotal_cents, tax_cents, total_cents, status, paypal_order_id, paypal_capture_id)
      VALUES (${orderId}, ${finalUserId}, ${userEmail}, ${orderData.subtotal_cents || 0}, ${orderData.tax_cents || 0}, ${orderData.total_cents || 0}, 'paid', ${orderData.paypal_order_id || null}, ${orderData.paypal_capture_id || null})
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
          // Convert pole_pockets to boolean for database (boolean column)
          const polePocketsValue = item.pole_pockets &&
            item.pole_pockets !== 'none' &&
            item.pole_pockets !== 'false' &&
            item.pole_pockets !== false;

          await sql`
            INSERT INTO order_items (
              id, order_id, width_in, height_in, quantity, material,
              grommets, rope_feet, pole_pockets, line_total_cents, file_key
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
              ${polePocketsValue},
              ${item.line_total_cents || 0},
              ${item.file_key || null}
            )
          `;
        } catch (itemError) {
          console.error('Error inserting order item:', itemError);
          throw new Error(`Failed to insert order item: ${itemError.message}`);
        }
      }
    }

    // Process AI artwork automatically for orders containing AI designs
    try {
      const aiItems = orderData.items?.filter(item => item.aiDesign) || [];
      
      if (aiItems.length > 0) {
        console.log(`Processing AI artwork for ${aiItems.length} items in order ${orderId}`);
        
        const artworkProcessingResponse = await fetch(`${process.env.URL || 'https://bannersonthefly.com'}/.netlify/functions/ai-artwork-processor`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            orderId: orderId,
            orderItems: aiItems,
            triggerSource: 'order_creation'
          }),
        });

        if (artworkProcessingResponse.ok) {
          const processingResult = await artworkProcessingResponse.json();
          console.log('AI artwork processing completed:', processingResult.summary);
          
          // Update order items with processed artwork URLs
          for (const processedItem of processingResult.processedItems) {
            if (processedItem.success !== false) {
              try {
                await sql`
                  UPDATE order_items 
                  SET 
                    print_ready_url = ${processedItem.printReady?.url || null},
                    web_preview_url = ${processedItem.webPreview?.url || null},
                    artwork_metadata_url = ${processedItem.metadata?.url || null}
                  WHERE order_id = ${orderId} AND id = ${processedItem.itemId}
                `;
                console.log(`Updated order item ${processedItem.itemId} with processed artwork URLs`);
              } catch (updateError) {
                console.error(`Failed to update order item ${processedItem.itemId} with artwork URLs:`, updateError);
                // Don't fail the order - artwork processing succeeded but DB update failed
              }
            }
          }
        } else {
          console.error('AI artwork processing failed:', await artworkProcessingResponse.text());
          // Don't fail the order creation - artwork processing can be retried later
        }
      }
    } catch (artworkError) {
      console.error('Error processing AI artwork:', artworkError);
      // Don't fail the order creation - artwork processing can be retried later
    }


    console.log('All order items created successfully');

    // Return structured response
    // Send order confirmation email
    try {
      console.log('Sending order confirmation email for order:', orderId);

      const emailResult = await sendOrderConfirmationEmail(orderId);

      if (emailResult.ok) {
        console.log('Order confirmation email sent successfully, email ID:', emailResult.id);
      } else {
        console.error('Failed to send order confirmation email:', emailResult.error);
        // Don't fail the order creation if email fails - the notify-order function handles database updates
      }
    } catch (emailError) {
      console.error('Error sending order confirmation email:', emailError);
      // Don't fail the order creation if email fails
    }

    const response = {
      ok: true,
      orderId: orderId,
      order: {
        id: orderId,
        user_id: orderData.user_id || null,
        email: userEmail,
        subtotal_cents: orderData.subtotal_cents || 0,
        tax_cents: orderData.tax_cents || 0,
        total_cents: orderData.total_cents || 0,
        status: 'paid',
        currency: orderData.currency || 'USD',
        tracking_number: null,
        tracking_carrier: null,
        created_at: orderResult[0]?.created_at || new Date().toISOString(),
        items: orderData.items || []
      }
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('❌ CRITICAL ERROR creating order:', error);
    console.error('Error stack:', error.stack);
    console.error('Order data that failed:', JSON.stringify(orderData, null, 2));

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'Failed to create order',
        details: error.message
      }),
    };
  }
};
