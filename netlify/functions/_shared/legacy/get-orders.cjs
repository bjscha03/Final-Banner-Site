const { neon } = require('@neondatabase/serverless');
const { normalizeTrackingEntries } = require('./tracking-helpers.cjs');
const { normalizeShippingAddress } = require('./shipping-address-helpers.cjs');
const { getSession, unauthorized } = require('../server-auth.cjs');

// Neon database connection
// Lazily initialize Neon with whichever DB URL is available
function getDbUrl() {
  return process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL || process.env.DATABASE_URL;
}

let neonFactory = neon;


exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    Pragma: 'no-cache',
    Expires: '0',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }
  const session = getSession(event);
  if (!session) return unauthorized();

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const dbUrl = getDbUrl();
    if (!dbUrl) {
      console.error('[get-orders] Database URL not found in environment variables');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Database configuration missing',
          details: 'Set NETLIFY_DATABASE_URL or VITE_DATABASE_URL or DATABASE_URL'
        }),
      };
    }

    // --- Diagnostic: log which DB env var is in use and the host (never log secrets) ---
    const whichVar = process.env.NETLIFY_DATABASE_URL ? 'NETLIFY_DATABASE_URL'
      : process.env.VITE_DATABASE_URL ? 'VITE_DATABASE_URL'
      : 'DATABASE_URL';
    let dbHost = '(unknown)';
    try { dbHost = new URL(dbUrl).hostname; } catch (_) { /* non-URL format */ }
    console.log(`[get-orders] Using ${whichVar} → host=${dbHost}`);

    const sql = neonFactory(dbUrl);

    // --- Diagnostic: verify connectivity + row count (cheap on PK-indexed table) ---
    if (process.env.DEBUG_ORDERS) {
      const [countRow] = await sql`SELECT current_schema() AS schema, COUNT(*) AS cnt FROM orders`;
      console.log(`[get-orders] schema=${countRow.schema}  orders COUNT(*)=${countRow.cnt}`);
    }

    const {
      user_id,
      page = 1,
      page_size: requestedPageSize,
      order_ids: requestedOrderIds,
    } = event.queryStringParameters || {};
    // Customer order history remains capped at 20. Verified Admin callers may
    // request a larger bounded page for the background full-history scan,
    // avoiding hundreds of tiny function round trips without creating an
    // unbounded response.
    const parsedPageSize = Number.parseInt(String(requestedPageSize || '20'), 10);
    const limit = !user_id && session.admin
      ? Math.min(75, Math.max(20, Number.isFinite(parsedPageSize) ? parsedPageSize : 20))
      : 20;
    const offset = (page - 1) * limit;
    const requestedAdminIds = !user_id && session.admin
      ? Array.from(new Set(String(requestedOrderIds || '')
        .split(',')
        .map((value) => value.trim())
        .filter((value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))))
        .slice(0, limit)
      : [];

    // READ-ONLY SCHEMA COMPATIBILITY: dynamically build the item JSON and
    // optional Admin filter from columns that actually exist. Missing fields
    // are emitted as NULL instead of running schema changes inside this GET.
    //
    // We use 'order_items'::regclass (resolved via search_path) instead of
    // filtering information_schema.columns by current_schema(). This works
    // regardless of which schema the table lives in, as long as the table
    // is reachable on the connection's search_path.
    let existingOrderCols = new Set();
    let existingItemCols = new Set();
    try {
      const [orderCols, itemCols] = await Promise.all([
        sql(
          `SELECT a.attname AS column_name
             FROM pg_attribute a
            WHERE a.attrelid = 'orders'::regclass
              AND a.attnum > 0
              AND NOT a.attisdropped`
        ),
        sql(
          `SELECT a.attname AS column_name
             FROM pg_attribute a
            WHERE a.attrelid = 'order_items'::regclass
              AND a.attnum > 0
              AND NOT a.attisdropped`
        ),
      ]);
      existingOrderCols = new Set(orderCols.map(r => r.column_name));
      existingItemCols = new Set(itemCols.map(r => r.column_name));
    } catch (introspectErr) {
      console.warn('[get-orders] Column introspection failed (non-fatal):', introspectErr.message);
    }

    const haveOrderIntrospection = existingOrderCols.size > 0;
    const orderColumn = (column, fallback = 'NULL') => (
      !haveOrderIntrospection || existingOrderCols.has(column) ? `o.${column}` : fallback
    );

    // (jsonKey, baseExpr-when-column-exists, fallbackExpr-when-missing)
    // baseExpr is used as-is when ALL the columns it depends on exist.
    // The dependent column is the same as jsonKey unless overridden via `deps`.
    const itemFields = [
      ['id',                              `oi.id`],
      ['width_in',                        `oi.width_in`],
      ['height_in',                       `oi.height_in`],
      ['quantity',                        `oi.quantity`],
      ['material',                        `oi.material`],
      ['grommets',                        `COALESCE(oi.grommets, 'none')`],
      ['rounded_corners',                 `oi.rounded_corners`],
      ['rope_feet',                       `COALESCE(oi.rope_feet, 0)`],
      ['rope_placement',                  `oi.rope_placement`],
      ['pole_pockets',                    `COALESCE(oi.pole_pockets, false)`],
      ['pole_pocket_position',            `oi.pole_pocket_position`],
      ['pole_pocket_size',                `oi.pole_pocket_size`],
      ['pole_pocket_cost_cents',          `oi.pole_pocket_cost_cents`],
      ['area_sqft',                       `(oi.width_in * oi.height_in / 144.0)`,                                                  ['width_in', 'height_in']],
      ['unit_price_cents',                `CASE WHEN oi.quantity > 0 THEN (oi.line_total_cents / oi.quantity) ELSE 0 END`,        ['quantity', 'line_total_cents']],
      ['line_total_cents',                `oi.line_total_cents`],
      ['file_key',                        `oi.file_key`],
      ['file_name',                       `oi.file_name`],
      ['file_url',                        `oi.file_url`],
      ['artwork_manifest',                `oi.artwork_manifest`],
      ['placement_preview',               `oi.placement_preview`],
      ['original_filename',               `oi.original_filename`],
      ['production_pdf_status',           `COALESCE(oi.production_pdf_status, 'pending')`],
      ['production_pdf_error',            `oi.production_pdf_error`],
      ['print_ready_url',                 `oi.print_ready_url`],
      ['web_preview_url',                 `oi.web_preview_url`],
      ['text_elements',                   `COALESCE(oi.text_elements, '[]'::jsonb)`],
      ['overlay_image',                   `oi.overlay_image`],
      ['overlay_images',                  `oi.overlay_images`],
      ['canvas_background_color',         `COALESCE(oi.canvas_background_color, '#FFFFFF')`],
      ['image_scale',                     `COALESCE(oi.image_scale, 1)`],
      ['image_position',                  `COALESCE(oi.image_position, '{"x": 0, "y": 0}'::jsonb)`],
      ['thumbnail_url',                   `oi.thumbnail_url`],
      ['final_render_url',                `oi.final_render_url`],
      ['final_render_file_key',           `oi.final_render_file_key`],
      ['final_render_width_px',           `oi.final_render_width_px`],
      ['final_render_height_px',          `oi.final_render_height_px`],
      ['final_render_dpi',                `oi.final_render_dpi`],
      ['canvas_state_json',               `oi.canvas_state_json`],
      ['design_service_enabled',          `COALESCE(oi.design_service_enabled, false)`],
      ['design_request_text',             `oi.design_request_text`],
      ['design_draft_preference',         `oi.design_draft_preference`],
      ['design_draft_contact',            `oi.design_draft_contact`],
      ['design_uploaded_assets',          `COALESCE(oi.design_uploaded_assets, '[]'::jsonb)`],
      ['final_print_pdf_url',             `oi.final_print_pdf_url`],
      ['final_print_pdf_file_key',        `oi.final_print_pdf_file_key`],
      ['final_print_pdf_uploaded_at',     `oi.final_print_pdf_uploaded_at`],
      ['generated_print_pdf_url',         `oi.generated_print_pdf_url`],
      ['generated_print_pdf_uploaded_at', `oi.generated_print_pdf_uploaded_at`],
      ['generated_print_pdf_metadata',     `oi.generated_print_pdf_metadata`],
      ['product_type',                    `COALESCE(oi.product_type, 'banner')`],
      ['yard_sign_sidedness',             `oi.yard_sign_sidedness`],
      ['yard_sign_step_stakes_enabled',   `COALESCE(oi.yard_sign_step_stakes_enabled, false)`],
      ['yard_sign_step_stakes_qty',       `COALESCE(oi.yard_sign_step_stakes_qty, 0)`],
      ['yard_sign_design_count',          `COALESCE(oi.yard_sign_design_count, 0)`],
      ['yard_sign_designs',               `oi.yard_sign_designs`],
      ['yard_sign_signs_subtotal_cents',  `COALESCE(oi.yard_sign_signs_subtotal_cents, 0)`],
      ['yard_sign_stakes_subtotal_cents', `COALESCE(oi.yard_sign_stakes_subtotal_cents, 0)`],
    ];

    // Build the per-item JSON expression. PostgreSQL has a hard
    // FUNC_MAX_ARGS=100 limit on function arguments, so a single
    // jsonb_build_object() call can hold at most 50 key/value pairs.
    // We chunk itemFields into ≤40-key groups and concatenate them with
    // the jsonb `||` operator so we stay safely under the limit.
    //
    // If introspection succeeded and a required column is missing,
    // substitute NULL for that key (so a stale schema never 500s the page).
    const buildItemJsonExpr = () => {
      const haveIntrospection = existingItemCols.size > 0;
      const pairs = itemFields.map(([key, baseExpr, depsArg]) => {
        const deps = depsArg || [key];
        const allExist = !haveIntrospection || deps.every(c => existingItemCols.has(c));
        return `'${key}', ${allExist ? baseExpr : 'NULL'}`;
      });

      const CHUNK_SIZE = 40; // 40 keys = 80 args, comfortably under FUNC_MAX_ARGS=100
      const chunks = [];
      for (let i = 0; i < pairs.length; i += CHUNK_SIZE) {
        chunks.push(`jsonb_build_object(\n                     ${pairs.slice(i, i + CHUNK_SIZE).join(',\n                     ')}\n                   )`);
      }
      // Single chunk: no concat needed. Multiple chunks: merge left-to-right with ||.
      return chunks.join('\n                   || ');
    };

    const itemJsonExpr = buildItemJsonExpr();

    // Note: parameter placeholders below ($1 etc.) follow the order they appear
    // in the params array passed to sql(query, params).
    let orders;

    if (user_id) {
      if (!session.admin && session.sub !== user_id) return unauthorized('Order ownership could not be verified');
      console.log('[get-orders] Fetching orders for user:', user_id);
      orders = await sql(
        `SELECT o.*,
                json_agg(
                  ${itemJsonExpr}
                ) as items
           FROM orders o
           LEFT JOIN order_items oi ON o.id = oi.order_id
           WHERE o.user_id = $1
           GROUP BY o.id
           ORDER BY o.created_at DESC
           LIMIT $2 OFFSET $3`,
        [user_id, limit, offset]
      );
    } else if (requestedAdminIds.length) {
      if (!session.admin) return unauthorized('Verified administrator session required');
      console.log('[get-orders] Fetching bounded Admin order IDs');
      orders = await sql(
        `SELECT o.*,
                json_agg(
                  ${itemJsonExpr}
                ) as items
           FROM orders o
           LEFT JOIN order_items oi ON o.id = oi.order_id
          WHERE o.id::text = ANY($1::text[])
          GROUP BY o.id
          ORDER BY array_position($1::text[], o.id::text)
          LIMIT $2`,
        [requestedAdminIds, limit]
      );
    } else {
      if (!session.admin) return unauthorized('Verified administrator session required');
      console.log('[get-orders] Fetching all orders (admin)');
      orders = await sql(
        `SELECT o.*,
                json_agg(
                  ${itemJsonExpr}
                ) as items
           FROM orders o
           LEFT JOIN order_items oi ON o.id = oi.order_id
           WHERE NOT (
             COALESCE(${orderColumn('payment_method')}, '') = 'stripe'
             AND COALESCE(${orderColumn('status')}, '') = 'pending'
             AND ${orderColumn('paypal_order_id')} IS NULL
             AND ${orderColumn('paypal_capture_id')} IS NULL
             AND ${orderColumn('stripe_charge_id')} IS NULL
             AND (
               ${orderColumn('email')} IS NULL
               OR NULLIF(TRIM(${orderColumn('email')}), '') IS NULL
               OR LOWER(TRIM(COALESCE(${orderColumn('customer_name')}, ''))) IN ('guest', 'guest customer')
             )
           )
           GROUP BY o.id
           ORDER BY o.created_at DESC
           LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
    }

    console.log(`[get-orders] Found ${orders.length} orders`);

    // Format the response
    const formattedOrders = orders.map(order => {
      // Keep canonical server-stored totals (already include same-day/saturday fees).
      // Only sanitize item array from LEFT JOIN null row artifacts.
      const _items = (order.items || []).filter(item => item && item.id !== null);
      const subtotal = Number(order.subtotal_cents) || 0;
      const tax = Number(order.tax_cents) || 0;
      const total = Number(order.total_cents) || 0;
      const saturdayFee = Number(order.saturday_fee_cents) || 0;
      const storedSameDayFee = Number(order.same_day_fee_cents) || 0;
      const residual = total - subtotal - tax - saturdayFee;
      const inferredSameDayFee = storedSameDayFee > 0 ? storedSameDayFee : (residual > 0 && String(order.status || '').toLowerCase() === 'paid' ? residual : 0);
      const inferredSameDaySelected = !!order.same_day_hit_service || inferredSameDayFee > 0;
      return {
      id: order.id,
      user_id: order.user_id,
      email: order.email,
      customer_name: order.customer_name,
      customer_first_name: order.customer_first_name,
      subtotal_cents: Number(order.subtotal_cents) || 0,
      tax_cents: Number(order.tax_cents) || 0,
      total_cents: Number(order.total_cents) || 0,
      status: order.status,
      currency: 'USD',
      tracking_number: order.tracking_number,
      tracking_numbers: normalizeTrackingEntries(order),
      trackingNumbers: normalizeTrackingEntries(order),
      tracking_carrier: order.tracking_number ? 'fedex' : null, // Default to fedex when tracking exists
      shipping_name: order.shipping_name,
      shipping_street: order.shipping_street,
      shipping_street2: order.shipping_street2,
      shipping_city: order.shipping_city,
      shipping_state: order.shipping_state,
      shipping_zip: order.shipping_zip,
      shipping_country: order.shipping_country,
      shippingAddress: normalizeShippingAddress(order),
      applied_discount_cents: Number(order.applied_discount_cents) || 0,
      applied_discount_label: order.applied_discount_label || '',
      applied_discount_type: order.applied_discount_type || 'none',
      production_email_sent: order.production_email_sent || false,
      production_email_sent_at: order.production_email_sent_at || null,
      production_email_status: order.production_email_status || 'pending',
      shipping_notification_sent: order.shipping_notification_sent || false,
      shipping_notification_sent_at: order.shipping_notification_sent_at || null,
      shipping_notification_status: order.shipping_notification_status || 'pending',
      confirmation_email_status: order.confirmation_email_status || 'pending',
      confirmation_emailed_at: order.confirmation_emailed_at || null,
      payment_method: order.payment_method || null,
      payment_reconciliation_status: order.payment_reconciliation_status || null,
      paypal_order_id: order.paypal_order_id || null,
      paypal_capture_id: order.paypal_capture_id || null,
      stripe_payment_intent_id: order.stripe_payment_intent_id || null,
      stripe_charge_id: order.stripe_charge_id || null,
      stripe_wallet_type: order.stripe_wallet_type || null,
      is_test_order: order.is_test_order === true,
      test_order_reason: order.test_order_reason || null,
      review_request_customer_email: order.review_request_customer_email || null,
      review_request_last_sent_at: order.review_request_last_sent_at || null,
      review_request_sent_count: Number(order.review_request_sent_count) || 0,
      same_day_hit_service: inferredSameDaySelected,
      saturday_delivery: !!order.saturday_delivery,
      same_day_fee_cents: inferredSameDayFee,
      saturday_fee_cents: Number(order.saturday_fee_cents) || 0,
      created_at: order.created_at,
      items: _items
    };
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(formattedOrders),
    };
  } catch (error) {
    console.error('[get-orders] Error fetching orders:', error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to fetch orders', 
        details: error.message,
        code: error.code || null
      }),
    };
  }
};

exports._test = {
  resetNeonFactory() {
    neonFactory = neon;
  },
  setNeonFactory(factory) {
    neonFactory = factory;
  },
};
