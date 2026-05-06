const { neon } = require('@neondatabase/serverless');
const { normalizeShippingAddress } = require('./shipping-address-helpers.cjs');

// Neon database connection
// Lazily initialize Neon with whichever DB URL is available
function getDbUrl() {
  return process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL || process.env.DATABASE_URL;
}

// Module-scoped cache: auto-migrations only need to run once per cold start.
// Running ~50 ALTER TABLE statements on every admin request was causing the
// function to exceed the default 10s Netlify timeout, returning 5xx errors
// to the admin Orders page ("Error Loading Orders").
let _migrationsRan = false;


exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

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

    const sql = neon(dbUrl);

    // --- Diagnostic: verify connectivity + row count (cheap on PK-indexed table) ---
    if (process.env.DEBUG_ORDERS) {
      const [countRow] = await sql`SELECT current_schema() AS schema, COUNT(*) AS cnt FROM orders`;
      console.log(`[get-orders] schema=${countRow.schema}  orders COUNT(*)=${countRow.cnt}`);
    }

    // AUTO-MIGRATE: Ensure all columns referenced by the query exist.
    // Each ALTER runs independently so a single failure does not roll back the rest
    // (PostgreSQL ALTER TABLE with multiple ADD COLUMN clauses is atomic).
    // Cached at module scope: only runs on the first invocation per cold start.
    const ALLOWED_TABLES = new Set(['orders', 'order_items']);
    // Whitelist allowed characters for column DDL: identifiers, types, defaults,
    // simple JSON/string literals, parens. Refuses anything with semicolons,
    // comments, or other statement-terminating characters.
    const SAFE_DDL_RE = /^[A-Za-z0-9_ ,'"\.\(\)\{\}\[\]:\-#=]+$/;
    const ensureColumn = async (table, columnDef) => {
      if (!ALLOWED_TABLES.has(table) || !SAFE_DDL_RE.test(columnDef)) {
        console.warn(`[get-orders] Refusing unsafe migration for ${table}/${columnDef}`);
        return;
      }
      try {
        await sql(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${columnDef}`);
      } catch (migErr) {
        console.warn(`[get-orders] Auto-migration ${table}.${columnDef} (non-fatal):`, migErr.message);
      }
    };

    const orderItemColumns = [
      `image_scale NUMERIC DEFAULT 1`,
      `image_position JSONB DEFAULT '{"x": 0, "y": 0}'::jsonb`,
      `thumbnail_url TEXT`,
      `overlay_image JSONB`,
      `overlay_images JSONB`,
      `canvas_background_color VARCHAR(20) DEFAULT '#FFFFFF'`,
      `file_key VARCHAR(255)`,
      `file_url TEXT`,
      `print_ready_url TEXT`,
      `web_preview_url TEXT`,
      `text_elements JSONB DEFAULT '[]'::jsonb`,
      `pole_pocket_position TEXT`,
      `rope_placement TEXT`,
      `pole_pocket_size TEXT`,
      `pole_pocket_cost_cents INTEGER DEFAULT 0`,
      `rounded_corners TEXT`,
      `final_render_url TEXT`,
      `final_render_file_key TEXT`,
      `final_render_width_px INTEGER`,
      `final_render_height_px INTEGER`,
      `final_render_dpi INTEGER`,
      `canvas_state_json TEXT`,
      `design_service_enabled BOOLEAN DEFAULT FALSE`,
      `design_request_text TEXT`,
      `design_draft_preference VARCHAR(10)`,
      `design_draft_contact VARCHAR(255)`,
      `design_uploaded_assets JSONB DEFAULT '[]'::jsonb`,
      `final_print_pdf_url TEXT`,
      `final_print_pdf_file_key TEXT`,
      `final_print_pdf_uploaded_at TIMESTAMP WITH TIME ZONE`,
      `generated_print_pdf_url TEXT`,
      `generated_print_pdf_uploaded_at TIMESTAMP WITH TIME ZONE`,
      `product_type TEXT DEFAULT 'banner'`,
      // Yard sign columns (added by create-order.cjs but referenced unconditionally
      // by get-orders SELECT; ensure they exist here too).
      `yard_sign_sidedness TEXT`,
      `yard_sign_step_stakes_enabled BOOLEAN DEFAULT false`,
      `yard_sign_step_stakes_qty INTEGER DEFAULT 0`,
      `yard_sign_design_count INTEGER DEFAULT 0`,
      `yard_sign_designs JSONB`,
      `yard_sign_signs_subtotal_cents INTEGER DEFAULT 0`,
      `yard_sign_stakes_subtotal_cents INTEGER DEFAULT 0`,
    ];
    if (!_migrationsRan) {
      for (const col of orderItemColumns) {
        await ensureColumn('order_items', col);
      }
      console.log('[get-orders] Auto-migration: order_items columns verified');
    }

    // AUTO-MIGRATE: Ensure orders table columns exist
    const orderColumns = [
      `email VARCHAR(255)`,
      `customer_name TEXT`,
      `customer_first_name TEXT`,
      `tracking_number VARCHAR(255)`,
      `shipping_name TEXT`,
      `shipping_street TEXT`,
      `shipping_street2 TEXT`,
      `shipping_city TEXT`,
      `shipping_state TEXT`,
      `shipping_zip TEXT`,
      `shipping_country TEXT DEFAULT 'US'`,
      `applied_discount_cents INTEGER DEFAULT 0`,
      `applied_discount_label TEXT DEFAULT ''`,
      `applied_discount_type TEXT DEFAULT 'none'`,
      `production_email_sent BOOLEAN DEFAULT FALSE`,
      `production_email_sent_at TIMESTAMP WITH TIME ZONE`,
      `production_email_status TEXT DEFAULT 'pending'`,
      `shipping_notification_sent BOOLEAN DEFAULT FALSE`,
      `shipping_notification_sent_at TIMESTAMP WITH TIME ZONE`,
      `shipping_notification_status TEXT DEFAULT 'pending'`,
      `confirmation_email_status TEXT DEFAULT 'pending'`,
      `confirmation_emailed_at TIMESTAMP WITH TIME ZONE`,
      // Same-Day Hit Service columns (added by create-order.cjs).
      `same_day_hit_service BOOLEAN DEFAULT FALSE`,
      `saturday_delivery BOOLEAN DEFAULT FALSE`,
      `same_day_fee_cents INTEGER DEFAULT 0`,
      `saturday_fee_cents INTEGER DEFAULT 0`,
      `order_timestamp_et TEXT`,
      `same_day_qualified BOOLEAN DEFAULT FALSE`,
    ];
    if (!_migrationsRan) {
      for (const col of orderColumns) {
        await ensureColumn('orders', col);
      }
      console.log('[get-orders] Auto-migration: orders columns verified');
      _migrationsRan = true;
    }

    const { user_id, page = 1 } = event.queryStringParameters || {};
    const limit = 20;
    const offset = (page - 1) * limit;

    // BULLETPROOF SELECT: dynamically build the json_build_object args
    // from columns that actually exist in order_items. If a column is
    // missing (e.g. a migration silently failed), it is emitted as NULL
    // instead of being referenced as `oi.col` which would throw
    // `column "..." does not exist` and 500 the whole admin page.
    //
    // We use 'order_items'::regclass (resolved via search_path) instead of
    // filtering information_schema.columns by current_schema(). This works
    // regardless of which schema the table lives in, as long as the table
    // is reachable on the connection's search_path.
    let existingItemCols = new Set();
    try {
      const cols = await sql(
        `SELECT a.attname AS column_name
           FROM pg_attribute a
          WHERE a.attrelid = 'order_items'::regclass
            AND a.attnum > 0
            AND NOT a.attisdropped`
      );
      existingItemCols = new Set(cols.map(r => r.column_name));
    } catch (introspectErr) {
      console.warn('[get-orders] Column introspection failed (non-fatal):', introspectErr.message);
    }

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
      ['file_url',                        `oi.file_url`],
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
    } else {
      console.log('[get-orders] Fetching all orders (admin)');
      orders = await sql(
        `SELECT o.*,
                json_agg(
                  ${itemJsonExpr}
                ) as items
           FROM orders o
           LEFT JOIN order_items oi ON o.id = oi.order_id
           WHERE NOT (
             COALESCE(o.payment_method, '') = 'stripe'
             AND COALESCE(o.status, '') = 'pending'
             AND o.paypal_order_id IS NULL
             AND o.paypal_capture_id IS NULL
             AND o.stripe_charge_id IS NULL
             AND (
               o.email IS NULL
               OR NULLIF(TRIM(o.email), '') IS NULL
               OR LOWER(TRIM(COALESCE(o.customer_name, ''))) IN ('guest', 'guest customer')
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
