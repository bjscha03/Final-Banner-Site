const { neon } = require('@neondatabase/serverless');
const { randomUUID } = require('crypto');

// Helper to detect bad URLs (blob:, data:, or huge strings)
function isBadUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return url.startsWith('blob:') || url.startsWith('data:') || url.length > 10000;
}

// Clean item of any bad URLs before database insert
function cleanItemForDb(item) {
  const cleaned = { ...item };
  
  // Clean direct URL fields
  if (isBadUrl(cleaned.file_url)) cleaned.file_url = null;
  if (isBadUrl(cleaned.thumbnail_url)) cleaned.thumbnail_url = null;
  if (isBadUrl(cleaned.web_preview_url)) cleaned.web_preview_url = null;
  if (isBadUrl(cleaned.print_ready_url)) cleaned.print_ready_url = null;
  
  // Clean overlay_image
  if (cleaned.overlay_image && typeof cleaned.overlay_image === 'object') {
    const oi = { ...cleaned.overlay_image };
    if (isBadUrl(oi.url)) oi.url = null;
    if (isBadUrl(oi.originalUrl)) oi.originalUrl = null;
    if (isBadUrl(oi.thumbnailUrl)) oi.thumbnailUrl = null;
    cleaned.overlay_image = oi;
  }
  
  // Clean overlay_images array
  if (Array.isArray(cleaned.overlay_images)) {
    cleaned.overlay_images = cleaned.overlay_images.map(img => {
      if (!img || typeof img !== 'object') return img;
      const ci = { ...img };
      if (isBadUrl(ci.url)) ci.url = null;
      if (isBadUrl(ci.originalUrl)) ci.originalUrl = null;
      if (isBadUrl(ci.thumbnailUrl)) ci.thumbnailUrl = null;
      return ci;
    });
  }
  
  return cleaned;
}




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
const sql = neon(process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL);

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
    const databaseUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!databaseUrl) {
      console.error('Database URL not found in environment variables');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Database configuration missing',
          details: 'NETLIFY_DATABASE_URL or DATABASE_URL environment variable not set'
        }),
      };
    }

    orderData = JSON.parse(event.body);
    
    // AUTO-MIGRATE: Ensure text_elements and overlay_image columns exist before processing order
    try {
      await sql`
        ALTER TABLE order_items
        ADD COLUMN IF NOT EXISTS text_elements JSONB DEFAULT '[]'::jsonb
      `;
      console.log('✅ Database migration: text_elements column verified/created');
    } catch (migrationError) {
      console.warn('⚠️ Database migration warning:', migrationError.message);
      // Continue anyway - column might already exist
    }
    
    // Add shipping address columns to orders table
    try {
      await sql`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS shipping_name TEXT,
        ADD COLUMN IF NOT EXISTS shipping_street TEXT,
        ADD COLUMN IF NOT EXISTS shipping_city TEXT,
        ADD COLUMN IF NOT EXISTS shipping_state TEXT,
        ADD COLUMN IF NOT EXISTS shipping_zip TEXT,
        ADD COLUMN IF NOT EXISTS shipping_country TEXT DEFAULT 'US'
      `;
      console.log('✅ Database migration: shipping address columns verified/created');
    } catch (migrationError) {
      console.warn('⚠️ Shipping address migration warning:', migrationError.message);
      // Continue anyway - columns might already exist
    }
    
    try {
      await sql`
        ALTER TABLE order_items
        ADD COLUMN IF NOT EXISTS overlay_image JSONB DEFAULT NULL, ADD COLUMN IF NOT EXISTS overlay_images JSONB DEFAULT NULL, ADD COLUMN IF NOT EXISTS canvas_background_color VARCHAR(20) DEFAULT '#FFFFFF' 
      `;
      console.log('✅ Database migration: overlay_image column verified/created');
    } catch (migrationError) {
      console.warn('⚠️ Database migration warning:', migrationError.message);
      // Continue anyway - column might already exist
    }

    // AUTO-MIGRATE: Ensure pole pocket columns exist
    try {
      await sql`
        ALTER TABLE order_items
        ADD COLUMN IF NOT EXISTS pole_pocket_position TEXT DEFAULT NULL
      `;
      console.log('✅ Database migration: pole_pocket_position column verified/created');
    } catch (migrationError) {
      console.warn('⚠️ Database migration warning:', migrationError.message);
    }

    try {
      await sql`
        ALTER TABLE order_items
        ADD COLUMN IF NOT EXISTS pole_pocket_size TEXT DEFAULT NULL
      `;
      console.log('✅ Database migration: pole_pocket_size column verified/created');
    } catch (migrationError) {
      console.warn('⚠️ Database migration warning:', migrationError.message);
    }

    try {
      await sql`
        ALTER TABLE order_items
        ADD COLUMN IF NOT EXISTS pole_pocket_cost_cents INTEGER DEFAULT 0
      `;
      console.log('✅ Database migration: pole_pocket_cost_cents column verified/created');
    } catch (migrationError) {
      console.warn('⚠️ Database migration warning:', migrationError.message);
    }
    
    console.log('Creating order with data:', orderData);
    console.log('Database URL available:', !!databaseUrl);
    console.log('📦 Items received:', orderData.items?.length || 0);
    if (orderData.items && orderData.items.length > 0) {
      orderData.items.forEach((item, index) => {
        console.log(`Item ${index + 1}:`, {
          width_in: item.width_in,
          height_in: item.height_in,
          file_key: item.file_key,
          text_elements: item.text_elements,
          pole_pockets: item.pole_pockets
        });
      });
    }

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
      INSERT INTO orders (id, user_id, email, subtotal_cents, tax_cents, total_cents, status, paypal_order_id, paypal_capture_id, shipping_name, shipping_street, shipping_city, shipping_state, shipping_zip, shipping_country)
      VALUES (${orderId}, ${finalUserId}, ${userEmail}, ${orderData.subtotal_cents || 0}, ${orderData.tax_cents || 0}, ${orderData.total_cents || 0}, 'paid', ${orderData.paypal_order_id || null}, ${orderData.paypal_capture_id || null}, ${orderData.shipping_name || null}, ${orderData.shipping_street || null}, ${orderData.shipping_city || null}, ${orderData.shipping_state || null}, ${orderData.shipping_zip || null}, ${orderData.shipping_country || 'US'})
      RETURNING *
    `;

    if (!orderResult || orderResult.length === 0) {
      throw new Error('Failed to create order - no result returned from database');
    }

    const order = orderResult[0];
    console.log('Order created successfully:', order);

    // Insert order items with better error handling - only use columns that exist in database
    if (orderData.items && Array.isArray(orderData.items)) {
      for (const rawItem of orderData.items) {
        const item = cleanItemForDb(rawItem);
        console.log("[Create Order] Cleaned item file_key:", item.file_key, "file_url:", item.file_url ? item.file_url.substring(0, 80) : null);
        console.log('Inserting order item:', JSON.stringify(item, null, 2));
        console.log('Item details - width_in:', item.width_in, 'height_in:', item.height_in, 'file_key:', item.file_key, 'text_elements:', item.text_elements);
        try {
          // Convert pole_pockets to boolean for database (boolean column)
          const polePocketsValue = item.pole_pockets &&
            item.pole_pockets !== 'none' &&
            item.pole_pockets !== 'false' &&
            item.pole_pockets !== false;

          // Try to insert with text_elements and overlay_image columns
          try {
            await sql`
              INSERT INTO order_items (
                id, order_id, width_in, height_in, quantity, material,
                grommets, rope_feet, pole_pockets, pole_pocket_position, pole_pocket_size, pole_pocket_cost_cents,
                line_total_cents, file_key, file_url, print_ready_url, web_preview_url, text_elements, overlay_image, overlay_images, canvas_background_color
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
                ${item.pole_pocket_position || null},
                ${item.pole_pocket_size || null},
                ${item.pole_pocket_cost_cents || 0},
                ${item.line_total_cents || 0},
                ${item.file_key || null},
                ${item.file_url || null},
                ${item.print_ready_url || null},
                ${item.web_preview_url || null},
                ${item.text_elements ? JSON.stringify(item.text_elements) : '[]'},
                ${item.overlay_image ? JSON.stringify(item.overlay_image) : null},
                ${item.overlay_images ? JSON.stringify(item.overlay_images) : null},
                ${item.canvas_background_color || '#FFFFFF'}
              )
            `;
          } catch (textElementsError) {
            // If text_elements column doesn't exist, try without it
            if (textElementsError.message && textElementsError.message.includes('column "text_elements" does not exist')) {
              console.warn('⚠️  text_elements column does not exist! Inserting without it. Please run: database-add-text-elements.sql');
              await sql`
                INSERT INTO order_items (
                  id, order_id, width_in, height_in, quantity, material,
                  grommets, rope_feet, pole_pockets, pole_pocket_position, pole_pocket_size, pole_pocket_cost_cents,
                  line_total_cents, file_key
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
                  ${item.pole_pocket_position || null},
                  ${item.pole_pocket_size || null},
                  ${item.pole_pocket_cost_cents || 0},
                  ${item.line_total_cents || 0},
                  ${item.file_key || null}
                )
              `;
              console.log('Order item inserted successfully WITHOUT text_elements (column missing)');
            } else {
              throw textElementsError;
            }
          }
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
          console.log('AI artwork processing completed:', processingResult.processedItems?.length || 0, "items");
          
          // Update order items with processed artwork URLs
          for (const processedItem of processingResult.processedItems) {
            if (processedItem.success !== false) {
              try {
                await sql`
                  UPDATE order_items 
                  SET 
                    print_ready_url = ${processedItem.printReadyUrl || null},
                    web_preview_url = ${processedItem.webPreviewUrl || null},
                    artwork_metadata_url = ${processedItem.artworkMetadataUrl || null}
                  WHERE order_id = ${orderId} AND id = ${processedItem.orderItemId}
                `;
                console.log(`Updated order item ${processedItem.orderItemId} with processed artwork URLs`);
              } catch (updateError) {
                console.error(`Failed to update order item ${processedItem.orderItemId} with artwork URLs:`, updateError);
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

    // Mark abandoned cart as recovered if this order came from an abandoned cart
    try {
      console.log('Checking for abandoned cart recovery...');
      
      // Try to find abandoned cart by email or user_id
      const abandonedCartQuery = finalUserId 
        ? await sql`
            SELECT id, recovery_status, total_value 
            FROM abandoned_carts 
            WHERE (user_id = ${finalUserId} OR email = ${userEmail})
              AND recovery_status IN ('active', 'abandoned')
            ORDER BY last_activity_at DESC
            LIMIT 1
          `
        : await sql`
            SELECT id, recovery_status, total_value 
            FROM abandoned_carts 
            WHERE email = ${userEmail}
              AND recovery_status IN ('active', 'abandoned')
            ORDER BY last_activity_at DESC
            LIMIT 1
          `;

      if (abandonedCartQuery && abandonedCartQuery.length > 0) {
        const abandonedCart = abandonedCartQuery[0];
        console.log(`Found abandoned cart ${abandonedCart.id} for recovery - marking as recovered`);
        
        await sql`
          UPDATE abandoned_carts
          SET 
            recovery_status = 'recovered',
            recovered_at = NOW(),
            recovered_order_id = ${orderId}
          WHERE id = ${abandonedCart.id}
        `;
        
        console.log(`✅ Abandoned cart ${abandonedCart.id} marked as recovered! Amount: $${abandonedCart.total_value}`);
      } else {
        console.log('No active abandoned cart found for this customer');
      }
    } catch (recoveryError) {
      console.error('Error marking abandoned cart as recovered:', recoveryError);
      // Don't fail the order creation if abandoned cart update fails
    }

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
