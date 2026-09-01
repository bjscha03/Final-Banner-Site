import { neon } from '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import legacyModule from './_shared/legacy/get-orders.cjs';
import visibilityModule from './_shared/admin-order-visibility.cjs';
import serverAuthModule from './_shared/server-auth.cjs';

const {
  hasCompletedPayPalPaymentEvidence,
  isAdminListableOrder,
} = visibilityModule;
const { getSession, unauthorized } = serverAuthModule;

const PAGE_SIZE = 20;
// Rich Admin rows include artwork/canvas metadata. Keep every report response
// to one UI-sized page so a valid request cannot create a multi-megabyte
// serverless response.
const MAX_ADMIN_REPORT_PAGE_SIZE = 20;
const MAX_ADMIN_PAGE = 100_000;
const ADMIN_LIST_ITEM_LIMIT = 8;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SYNTHETIC_EMAIL_LOCAL_PARTS = new Set([
  'customer', 'guest', 'guestcustomer', 'noemail', 'none', 'noreply', 'preview', 'test', 'unknown',
]);
const SYNTHETIC_EMAIL_DOMAINS = new Set([
  'example.com', 'example.net', 'example.org', 'example.test', 'invalid', 'localhost', 'test.com',
]);
const PRIVATE_ORDER_RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  Pragma: 'no-cache',
  Expires: '0',
};

// Keep Stripe settlement reconciliation coupled to the verified paid-order
// follow-up bundle when Netlify performs incremental function builds.
const PAYMENT_BUILD = 'verified-followups-v3';

const normalizedEmailSql = (expression) => `LOWER(BTRIM(COALESCE(${expression}, '')))`;

const validReportingEmailSql = (expression) => {
  const normalized = normalizedEmailSql(expression);
  return `(
    LENGTH(${normalized}) BETWEEN 3 AND 254
    AND ${normalized} ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
    AND SPLIT_PART(${normalized}, '@', 1) <> ALL (
      ARRAY['customer','guest','guestcustomer','noemail','none','noreply','preview','test','unknown']::text[]
    )
    AND SPLIT_PART(${normalized}, '@', 2) <> ALL (
      ARRAY['example.com','example.net','example.org','example.test','invalid','localhost','test.com']::text[]
    )
    AND SPLIT_PART(${normalized}, '@', 2) !~ '[.](invalid|local|test)$'
    AND NOT (
      SPLIT_PART(${normalized}, '@', 2) = 'bannersonthefly.com'
      AND SPLIT_PART(${normalized}, '@', 1) ~ '^(guest|preview|test)[-_+]'
    )
  )`;
};

const reportingCustomerEmailSql = (orderEmailExpression, profileEmailExpression) => `CASE
  WHEN ${validReportingEmailSql(orderEmailExpression)} THEN ${normalizedEmailSql(orderEmailExpression)}
  WHEN ${validReportingEmailSql(profileEmailExpression)} THEN ${normalizedEmailSql(profileEmailExpression)}
  ELSE NULL
END`;

function normalizeReportingCustomerEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const splitAt = email.lastIndexOf('@');
  const local = email.slice(0, splitAt);
  const domain = email.slice(splitAt + 1);
  if (SYNTHETIC_EMAIL_LOCAL_PARTS.has(local) || SYNTHETIC_EMAIL_DOMAINS.has(domain)) return null;
  if (/\.(invalid|local|test)$/.test(domain)) return null;
  if (/^(guest|preview|test)[-_+]/.test(local) && domain === 'bannersonthefly.com') return null;
  return email;
}

const orderBaseCteSql = () => {
  const orderEmail = `to_jsonb(o)->>'email'`;
  const profileEmail = 'profiles.email';
  return `
    WITH order_base AS (
      SELECT o.id::text AS id,
             o.user_id::text AS user_id,
             o.created_at,
             COALESCE(o.total_cents, 0)::bigint AS total_cents,
             LOWER(BTRIM(COALESCE(o.status, ''))) AS raw_status,
             LOWER(BTRIM(COALESCE(to_jsonb(o)->>'payment_method', ''))) AS payment_method,
             LOWER(BTRIM(COALESCE(to_jsonb(o)->>'payment_reconciliation_status', ''))) AS reconciliation_status,
             NULLIF(BTRIM(to_jsonb(o)->>'paypal_capture_id'), '') AS paypal_capture_id,
             LOWER(COALESCE(to_jsonb(o)->>'is_test_order', 'false')) = 'true' AS is_test_order,
             NULLIF(BTRIM(to_jsonb(o)->>'tracking_number'), '') AS tracking_number,
             BTRIM(COALESCE(to_jsonb(o)->>'customer_name', '')) AS customer_name,
             BTRIM(COALESCE(to_jsonb(o)->>'customer_first_name', '')) AS customer_first_name,
             BTRIM(COALESCE(to_jsonb(o)->>'shipping_name', '')) AS shipping_name,
             ${normalizedEmailSql(orderEmail)} AS raw_order_email,
             ${normalizedEmailSql(profileEmail)} AS raw_profile_email,
             ${reportingCustomerEmailSql(orderEmail, profileEmail)} AS reporting_customer_email,
             CASE
               WHEN NULLIF(BTRIM(to_jsonb(o)->>'tracking_number'), '') IS NOT NULL
                AND LOWER(BTRIM(COALESCE(o.status, ''))) IN ('pending', 'paid', 'in_production')
                 THEN 'shipped'
               WHEN LOWER(BTRIM(COALESCE(o.status, ''))) = 'pending'
                AND (
                  NULLIF(BTRIM(to_jsonb(o)->>'paypal_capture_id'), '') IS NOT NULL
                  OR (
                    LOWER(BTRIM(COALESCE(to_jsonb(o)->>'payment_method', ''))) = 'paypal'
                    AND LOWER(BTRIM(COALESCE(to_jsonb(o)->>'payment_reconciliation_status', ''))) = 'complete'
                  )
                ) THEN 'paid'
               ELSE LOWER(BTRIM(COALESCE(o.status, '')))
             END AS effective_status
        FROM orders AS o
        LEFT JOIN profiles ON o.user_id = profiles.id
    ), visible_orders AS (
      SELECT *
        FROM order_base
       WHERE payment_method <> 'admin_deploy_preview_test'
         AND is_test_order = FALSE
    )`;
};

const hasSavedTracking = (order = {}) => {
  if (String(order.tracking_number || '').trim()) return true;
  const trackingNumbers = order.tracking_numbers || order.trackingNumbers;
  if (!Array.isArray(trackingNumbers)) return false;
  return trackingNumbers.some((entry) => String(
    typeof entry === 'string' ? entry : entry?.tracking_number || entry?.trackingNumber || entry?.number || '',
  ).trim());
};

const deriveFulfillmentStatus = (order = {}) => {
  const status = String(order.status || '').trim().toLowerCase();
  return hasSavedTracking(order) && ['pending', 'paid', 'in_production'].includes(status)
    ? 'shipped'
    : order.status;
};

const buildAdminPageQuery = () => `${orderBaseCteSql()},
    filtered_orders AS (
      SELECT *
        FROM visible_orders
       WHERE ($1::timestamptz IS NULL OR created_at >= $1::timestamptz)
         AND ($2::timestamptz IS NULL OR created_at < $2::timestamptz)
         AND (
           $3::text = ''
           OR POSITION($3::text IN LOWER(COALESCE(id, ''))) > 0
           OR POSITION($3::text IN LOWER(COALESCE(user_id, ''))) > 0
           OR POSITION($3::text IN LOWER(COALESCE(customer_name, ''))) > 0
           OR POSITION($3::text IN LOWER(COALESCE(customer_first_name, ''))) > 0
           OR POSITION($3::text IN LOWER(COALESCE(shipping_name, ''))) > 0
           OR POSITION($3::text IN raw_order_email) > 0
           OR POSITION($3::text IN raw_profile_email) > 0
           OR POSITION($3::text IN COALESCE(reporting_customer_email, '')) > 0
         )
    ), paged_orders AS (
      SELECT id, created_at
        FROM filtered_orders
       ORDER BY created_at DESC, id DESC
       LIMIT $4 OFFSET $5
    )
    SELECT COALESCE((
             SELECT jsonb_agg(jsonb_build_object('id', id) ORDER BY created_at DESC, id DESC)
               FROM paged_orders
           ), '[]'::jsonb) AS page_orders,
           (SELECT COUNT(*)::integer FROM filtered_orders) AS total_items`;

const buildAdminSummaryQuery = () => `${orderBaseCteSql()},
    successful_lifetime AS (
      SELECT order_base.*,
             CASE WHEN reporting_customer_email IS NOT NULL THEN
               ROW_NUMBER() OVER (
                 PARTITION BY reporting_customer_email
                 ORDER BY created_at ASC, id ASC
               )
             ELSE NULL END AS lifetime_rank
        FROM order_base
       WHERE is_test_order = FALSE
         AND payment_method <> 'admin_deploy_preview_test'
         AND effective_status IN ('paid', 'in_production', 'shipped', 'delivered', 'fulfilled')
    ), period_successful AS (
      SELECT *
        FROM successful_lifetime
       WHERE ($1::timestamptz IS NULL OR created_at >= $1::timestamptz)
         AND ($2::timestamptz IS NULL OR created_at < $2::timestamptz)
    ), period_reportable AS (
      SELECT *
        FROM order_base
       WHERE is_test_order = FALSE
         AND payment_method <> 'admin_deploy_preview_test'
         AND effective_status IN ('paid', 'in_production', 'shipped', 'delivered', 'fulfilled', 'refunded')
         AND ($1::timestamptz IS NULL OR created_at >= $1::timestamptz)
         AND ($2::timestamptz IS NULL OR created_at < $2::timestamptz)
    ), customer_flags AS (
      SELECT reporting_customer_email,
             BOOL_OR(lifetime_rank = 1) AS is_new,
             BOOL_OR(lifetime_rank > 1) AS is_repeat
        FROM period_successful
       WHERE reporting_customer_email IS NOT NULL
       GROUP BY reporting_customer_email
    ), period_totals AS (
      SELECT COUNT(*) FILTER (WHERE effective_status IN ('paid', 'in_production', 'shipped', 'delivered', 'fulfilled'))::integer AS total_orders,
             COALESCE(SUM(GREATEST(total_cents, 0)), 0)::bigint AS gross_sales_cents,
             COALESCE(SUM(GREATEST(total_cents, 0)) FILTER (WHERE effective_status = 'refunded'), 0)::bigint AS recorded_refunds_cents
        FROM period_reportable
    ), customer_totals AS (
      SELECT COUNT(*)::integer AS identified_customers,
             COUNT(*) FILTER (WHERE is_new)::integer AS new_customers,
             COUNT(*) FILTER (WHERE is_repeat)::integer AS repeat_customers
        FROM customer_flags
    ), overview AS (
      SELECT COUNT(*)::integer AS overview_total_orders,
             COUNT(*) FILTER (WHERE effective_status = 'in_production')::integer AS overview_in_production_orders,
             COUNT(*) FILTER (
               WHERE effective_status <> 'refunded'
                 AND (
                   tracking_number IS NOT NULL
                   OR effective_status IN ('shipped', 'delivered', 'fulfilled')
                 )
             )::integer AS overview_shipped_orders,
             COUNT(*) FILTER (
               WHERE effective_status <> 'refunded'
                 AND effective_status NOT IN ('failed', 'canceled', 'cancelled')
                 AND tracking_number IS NULL
                 AND effective_status <> 'in_production'
                 AND effective_status NOT IN ('shipped', 'delivered', 'fulfilled')
             )::integer AS overview_pending_orders,
             COUNT(*) FILTER (WHERE effective_status = 'refunded' AND is_test_order = FALSE)::integer AS overview_refunded_orders,
             COALESCE(SUM(GREATEST(total_cents, 0)) FILTER (
               WHERE is_test_order = FALSE AND effective_status IN ('paid', 'in_production', 'shipped', 'delivered', 'fulfilled')
             ), 0)::bigint AS overview_total_revenue_cents,
             COALESCE(SUM(GREATEST(total_cents, 0)) FILTER (
               WHERE is_test_order = FALSE AND effective_status = 'refunded'
             ), 0)::bigint AS overview_refunded_revenue_cents
        FROM visible_orders
    )
    SELECT period_totals.*,
           (period_totals.gross_sales_cents - period_totals.recorded_refunds_cents)::bigint AS net_sales_cents,
           CASE WHEN period_totals.total_orders > 0 THEN
             ROUND(
               (period_totals.gross_sales_cents - period_totals.recorded_refunds_cents)::numeric
               / period_totals.total_orders
             )::bigint
           ELSE 0::bigint END AS average_order_value_cents,
           customer_totals.identified_customers,
           customer_totals.new_customers,
           customer_totals.repeat_customers,
           CASE WHEN customer_totals.identified_customers > 0 THEN
             customer_totals.repeat_customers::double precision / customer_totals.identified_customers
           ELSE 0::double precision END AS repeat_rate,
           overview.*
      FROM period_totals
      CROSS JOIN customer_totals
      CROSS JOIN overview`;

// The report page intentionally projects only bounded scalar/item-summary
// fields. Full production-scene JSON and every item remain available through
// the authenticated single-order detail endpoint when an Admin opens a row.
const buildAdminHydrationQuery = () => `
  WITH requested_order_ids AS (
    SELECT requested.id, requested.position
      FROM unnest($1::uuid[]) WITH ORDINALITY AS requested(id, position)
  )
  SELECT o.id::text AS id,
         o.user_id::text AS user_id,
         LEFT(to_jsonb(o)->>'email', 320) AS email,
         LEFT(to_jsonb(o)->>'customer_name', 500) AS customer_name,
         LEFT(to_jsonb(o)->>'customer_first_name', 200) AS customer_first_name,
         LEFT(to_jsonb(o)->>'customer_phone', 100) AS customer_phone,
         COALESCE((to_jsonb(o)->>'subtotal_cents')::bigint, 0) AS subtotal_cents,
         COALESCE((to_jsonb(o)->>'tax_cents')::bigint, 0) AS tax_cents,
         COALESCE(o.total_cents, 0)::bigint AS total_cents,
         LEFT(COALESCE(o.status, ''), 40) AS status,
         o.created_at,
         LEFT(to_jsonb(o)->>'tracking_number', 500) AS tracking_number,
         LEFT(to_jsonb(o)->>'shipping_name', 500) AS shipping_name,
         LEFT(to_jsonb(o)->>'shipping_street', 500) AS shipping_street,
         LEFT(to_jsonb(o)->>'shipping_street2', 500) AS shipping_street2,
         LEFT(to_jsonb(o)->>'shipping_city', 200) AS shipping_city,
         LEFT(to_jsonb(o)->>'shipping_state', 100) AS shipping_state,
         LEFT(to_jsonb(o)->>'shipping_zip', 40) AS shipping_zip,
         LEFT(to_jsonb(o)->>'shipping_country', 100) AS shipping_country,
         COALESCE((to_jsonb(o)->>'applied_discount_cents')::bigint, 0) AS applied_discount_cents,
         LEFT(to_jsonb(o)->>'applied_discount_label', 500) AS applied_discount_label,
         LEFT(to_jsonb(o)->>'applied_discount_type', 100) AS applied_discount_type,
         LEFT(to_jsonb(o)->>'discount_code', 100) AS discount_code,
         LOWER(COALESCE(to_jsonb(o)->>'production_email_sent', 'false')) = 'true' AS production_email_sent,
         (to_jsonb(o)->>'production_email_sent_at')::timestamptz AS production_email_sent_at,
         LEFT(to_jsonb(o)->>'production_email_status', 100) AS production_email_status,
         LOWER(COALESCE(to_jsonb(o)->>'shipping_notification_sent', 'false')) = 'true' AS shipping_notification_sent,
         (to_jsonb(o)->>'shipping_notification_sent_at')::timestamptz AS shipping_notification_sent_at,
         LEFT(to_jsonb(o)->>'shipping_notification_status', 100) AS shipping_notification_status,
         LEFT(to_jsonb(o)->>'confirmation_email_status', 100) AS confirmation_email_status,
         (to_jsonb(o)->>'confirmation_emailed_at')::timestamptz AS confirmation_emailed_at,
         LEFT(to_jsonb(o)->>'payment_method', 100) AS payment_method,
         LEFT(to_jsonb(o)->>'payment_reconciliation_status', 100) AS payment_reconciliation_status,
         LEFT(to_jsonb(o)->>'paypal_order_id', 500) AS paypal_order_id,
         LEFT(to_jsonb(o)->>'paypal_capture_id', 500) AS paypal_capture_id,
         LEFT(to_jsonb(o)->>'stripe_payment_intent_id', 500) AS stripe_payment_intent_id,
         LEFT(to_jsonb(o)->>'stripe_charge_id', 500) AS stripe_charge_id,
         LEFT(to_jsonb(o)->>'stripe_wallet_type', 100) AS stripe_wallet_type,
         LOWER(COALESCE(to_jsonb(o)->>'is_test_order', 'false')) = 'true' AS is_test_order,
         LEFT(to_jsonb(o)->>'test_order_reason', 500) AS test_order_reason,
         LOWER(COALESCE(to_jsonb(o)->>'same_day_hit_service', 'false')) = 'true' AS same_day_hit_service,
         LOWER(COALESCE(to_jsonb(o)->>'saturday_delivery', 'false')) = 'true' AS saturday_delivery,
         COALESCE((to_jsonb(o)->>'same_day_fee_cents')::bigint, 0) AS same_day_fee_cents,
         COALESCE((to_jsonb(o)->>'saturday_fee_cents')::bigint, 0) AS saturday_fee_cents,
         COALESCE(item_page.items, '[]'::jsonb) AS items,
         (SELECT COUNT(*)::integer FROM order_items item_count WHERE item_count.order_id = o.id) AS item_count
    FROM requested_order_ids requested
    JOIN orders o ON o.id = requested.id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(to_jsonb(item_summary) - 'sort_created_at' ORDER BY item_summary.sort_created_at, item_summary.id) AS items
        FROM (
          SELECT oi.id::text AS id,
                 oi.created_at AS sort_created_at,
                 oi.width_in,
                 oi.height_in,
                 oi.quantity,
                 LEFT(oi.material::text, 100) AS material,
                 LEFT(to_jsonb(oi)->>'product_type', 100) AS product_type,
                 LEFT(to_jsonb(oi)->>'grommets', 100) AS grommets,
                 LEFT(to_jsonb(oi)->>'rounded_corners', 100) AS rounded_corners,
                 COALESCE((to_jsonb(oi)->>'rope_feet')::integer, 0) AS rope_feet,
                 LEFT(to_jsonb(oi)->>'pole_pockets', 100) AS pole_pockets,
                 LEFT(to_jsonb(oi)->>'pole_pocket_position', 100) AS pole_pocket_position,
                 LEFT(to_jsonb(oi)->>'pole_pocket_size', 100) AS pole_pocket_size,
                 COALESCE((to_jsonb(oi)->>'pole_pocket_cost_cents')::bigint, 0) AS pole_pocket_cost_cents,
                 (oi.width_in * oi.height_in / 144.0) AS area_sqft,
                 CASE WHEN oi.quantity > 0 THEN oi.line_total_cents / oi.quantity ELSE 0 END AS unit_price_cents,
                 oi.line_total_cents,
                 LEFT(to_jsonb(oi)->>'file_key', 512) AS file_key,
                 LEFT(to_jsonb(oi)->>'file_name', 512) AS file_name,
                 LEFT(to_jsonb(oi)->>'file_url', 1024) AS file_url,
                 LEFT(to_jsonb(oi)->>'original_filename', 512) AS original_filename,
                 LEFT(to_jsonb(oi)->>'print_ready_url', 1024) AS print_ready_url,
                 LEFT(to_jsonb(oi)->>'web_preview_url', 1024) AS web_preview_url,
                 LEFT(to_jsonb(oi)->>'thumbnail_url', 1024) AS thumbnail_url,
                 CASE WHEN (to_jsonb(oi)->'placement_preview') IS NULL THEN NULL
                   ELSE jsonb_build_object(
                     'version', CASE
                       WHEN jsonb_typeof((to_jsonb(oi)->'placement_preview')->'version') = 'number'
                        AND LENGTH(((to_jsonb(oi)->'placement_preview')->'version')::text) <= 32
                       THEN (to_jsonb(oi)->'placement_preview')->'version' ELSE 'null'::jsonb END,
                     'uploadStatus', LEFT((to_jsonb(oi)->'placement_preview')->>'uploadStatus', 50),
                     'sourceUrl', LEFT((to_jsonb(oi)->'placement_preview')->>'sourceUrl', 1024),
                     'sourceIdentity', LEFT((to_jsonb(oi)->'placement_preview')->>'sourceIdentity', 512),
                     'productType', LEFT((to_jsonb(oi)->'placement_preview')->>'productType', 100),
                     'widthIn', CASE
                       WHEN jsonb_typeof((to_jsonb(oi)->'placement_preview')->'widthIn') = 'number'
                        AND LENGTH(((to_jsonb(oi)->'placement_preview')->'widthIn')::text) <= 32
                       THEN (to_jsonb(oi)->'placement_preview')->'widthIn' ELSE 'null'::jsonb END,
                     'heightIn', CASE
                       WHEN jsonb_typeof((to_jsonb(oi)->'placement_preview')->'heightIn') = 'number'
                        AND LENGTH(((to_jsonb(oi)->'placement_preview')->'heightIn')::text) <= 32
                       THEN (to_jsonb(oi)->'placement_preview')->'heightIn' ELSE 'null'::jsonb END,
                     'fitMode', LEFT((to_jsonb(oi)->'placement_preview')->>'fitMode', 20),
                     'positionPct', jsonb_build_object(
                       'x', CASE
                         WHEN jsonb_typeof(((to_jsonb(oi)->'placement_preview')->'positionPct')->'x') = 'number'
                          AND LENGTH((((to_jsonb(oi)->'placement_preview')->'positionPct')->'x')::text) <= 32
                         THEN ((to_jsonb(oi)->'placement_preview')->'positionPct')->'x' ELSE 'null'::jsonb END,
                       'y', CASE
                         WHEN jsonb_typeof(((to_jsonb(oi)->'placement_preview')->'positionPct')->'y') = 'number'
                          AND LENGTH((((to_jsonb(oi)->'placement_preview')->'positionPct')->'y')::text) <= 32
                         THEN ((to_jsonb(oi)->'placement_preview')->'positionPct')->'y' ELSE 'null'::jsonb END
                     ),
                     'scaleX', CASE
                       WHEN jsonb_typeof((to_jsonb(oi)->'placement_preview')->'scaleX') = 'number'
                        AND LENGTH(((to_jsonb(oi)->'placement_preview')->'scaleX')::text) <= 32
                       THEN (to_jsonb(oi)->'placement_preview')->'scaleX' ELSE 'null'::jsonb END,
                     'scaleY', CASE
                       WHEN jsonb_typeof((to_jsonb(oi)->'placement_preview')->'scaleY') = 'number'
                        AND LENGTH(((to_jsonb(oi)->'placement_preview')->'scaleY')::text) <= 32
                       THEN (to_jsonb(oi)->'placement_preview')->'scaleY' ELSE 'null'::jsonb END,
                     'compositionRevision', CASE
                       WHEN jsonb_typeof((to_jsonb(oi)->'placement_preview')->'compositionRevision') = 'number'
                        AND LENGTH(((to_jsonb(oi)->'placement_preview')->'compositionRevision')::text) <= 32
                       THEN (to_jsonb(oi)->'placement_preview')->'compositionRevision' ELSE 'null'::jsonb END,
                     'compositionSignature', LEFT((to_jsonb(oi)->'placement_preview')->>'compositionSignature', 200),
                     'url', LEFT((to_jsonb(oi)->'placement_preview')->>'url', 1024),
                     'publicId', LEFT((to_jsonb(oi)->'placement_preview')->>'publicId', 512),
                     'previewUrl', LEFT((to_jsonb(oi)->'placement_preview')->>'previewUrl', 1024),
                     'previewPublicId', LEFT((to_jsonb(oi)->'placement_preview')->>'previewPublicId', 512),
                     'previewWidthPx', CASE
                       WHEN jsonb_typeof((to_jsonb(oi)->'placement_preview')->'previewWidthPx') = 'number'
                        AND LENGTH(((to_jsonb(oi)->'placement_preview')->'previewWidthPx')::text) <= 32
                       THEN (to_jsonb(oi)->'placement_preview')->'previewWidthPx' ELSE 'null'::jsonb END,
                     'previewHeightPx', CASE
                       WHEN jsonb_typeof((to_jsonb(oi)->'placement_preview')->'previewHeightPx') = 'number'
                        AND LENGTH(((to_jsonb(oi)->'placement_preview')->'previewHeightPx')::text) <= 32
                       THEN (to_jsonb(oi)->'placement_preview')->'previewHeightPx' ELSE 'null'::jsonb END
                   )
                 END AS placement_preview,
                 LEFT(to_jsonb(oi)->>'final_render_url', 1024) AS final_render_url,
                 LEFT(to_jsonb(oi)->>'final_render_file_key', 512) AS final_render_file_key,
                 (to_jsonb(oi)->>'final_render_width_px')::integer AS final_render_width_px,
                 (to_jsonb(oi)->>'final_render_height_px')::integer AS final_render_height_px,
                 (to_jsonb(oi)->>'final_render_dpi')::integer AS final_render_dpi,
                 LOWER(COALESCE(to_jsonb(oi)->>'design_service_enabled', 'false')) = 'true' AS design_service_enabled,
                 LEFT(to_jsonb(oi)->>'final_print_pdf_url', 1024) AS final_print_pdf_url,
                 LEFT(to_jsonb(oi)->>'final_print_pdf_file_key', 512) AS final_print_pdf_file_key,
                 (to_jsonb(oi)->>'final_print_pdf_uploaded_at')::timestamptz AS final_print_pdf_uploaded_at,
                 LEFT(to_jsonb(oi)->>'generated_print_pdf_url', 1024) AS generated_print_pdf_url,
                 LEFT(to_jsonb(oi)->>'yard_sign_sidedness', 100) AS yard_sign_sidedness,
                 LOWER(COALESCE(to_jsonb(oi)->>'yard_sign_step_stakes_enabled', 'false')) = 'true' AS yard_sign_step_stakes_enabled,
                 COALESCE((to_jsonb(oi)->>'yard_sign_step_stakes_qty')::integer, 0) AS yard_sign_step_stakes_qty,
                 COALESCE((to_jsonb(oi)->>'yard_sign_design_count')::integer, 0) AS yard_sign_design_count,
                 COALESCE((to_jsonb(oi)->>'yard_sign_signs_subtotal_cents')::bigint, 0) AS yard_sign_signs_subtotal_cents,
                 COALESCE((to_jsonb(oi)->>'yard_sign_stakes_subtotal_cents')::bigint, 0) AS yard_sign_stakes_subtotal_cents
            FROM order_items oi
           WHERE oi.order_id = o.id
           ORDER BY oi.created_at ASC NULLS LAST, oi.id ASC
           LIMIT $2
        ) item_summary
    ) item_page ON TRUE
   ORDER BY requested.position`;

const parseOrders = (response) => {
  if (!response?.body) return null;
  try {
    const parsed = JSON.parse(response.body);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

function secureOrderResponse(response = {}) {
  const responseHeaders = Object.fromEntries(
    Object.entries(response?.headers || {}).filter(([name, value]) => !(
      name.toLowerCase() === 'access-control-allow-origin'
      && String(value || '').trim() === '*'
    )),
  );
  return {
    ...response,
    headers: {
      ...responseHeaders,
      ...PRIVATE_ORDER_RESPONSE_HEADERS,
    },
  };
}

const fetchLegacyOrdersPage = (event, context, page) => legacyModule.handler({
  ...event,
  queryStringParameters: {
    ...(event?.queryStringParameters || {}),
    page: String(page),
  },
}, context);

async function enrichOrderPaymentMetadata(sql, orders, options = {}) {
  if (!orders.length) return orders;

  const ids = orders
    .map((order) => String(order?.id || '').trim())
    .filter(Boolean);
  if (!ids.length) return orders;

  const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');
  const paymentRows = await sql(
    `SELECT orders.id::text AS id,
            orders.total_cents,
            LEFT(orders.payment_method::text, 100) AS payment_method,
            LEFT(orders.paypal_order_id::text, 500) AS paypal_order_id,
            LEFT(orders.paypal_capture_id::text, 500) AS paypal_capture_id,
            LEFT(orders.stripe_payment_intent_id::text, 500) AS stripe_payment_intent_id,
            LEFT(orders.stripe_charge_id::text, 500) AS stripe_charge_id,
            LEFT(orders.stripe_wallet_type::text, 100) AS stripe_wallet_type,
            orders.is_test_order,
            LEFT(orders.test_order_reason::text, 500) AS test_order_reason,
            ${reportingCustomerEmailSql('orders.email', 'profiles.email')} AS reporting_customer_email,
            LEFT(to_jsonb(orders)->>'payment_reconciliation_status', 100) AS payment_reconciliation_status,
            LEFT(to_jsonb(orders)->>'confirmation_email_status', 100) AS confirmation_email_status,
            to_jsonb(orders)->>'confirmation_emailed_at' AS confirmation_emailed_at,
            LEFT(to_jsonb(orders)->>'admin_notification_status', 100) AS admin_notification_status,
            to_jsonb(orders)->>'admin_notification_sent_at' AS admin_notification_sent_at,
            LEFT(to_jsonb(orders)->>'production_email_status', 100) AS production_email_status,
            to_jsonb(orders)->>'production_email_sent' AS production_email_sent,
            to_jsonb(orders)->>'production_email_sent_at' AS production_email_sent_at,
            LEFT(to_jsonb(orders)->>'shipping_notification_status', 100) AS shipping_notification_status,
            to_jsonb(orders)->>'shipping_notification_sent' AS shipping_notification_sent,
            to_jsonb(orders)->>'shipping_notification_sent_at' AS shipping_notification_sent_at
       FROM orders
       LEFT JOIN profiles ON orders.user_id = profiles.id
      WHERE orders.id::text IN (${placeholders})`,
    ids,
  );
  const paymentById = new Map(paymentRows.map((row) => [String(row.id), row]));

  // Review-request history is intentionally isolated from the orders table.
  // If migration 020 has not run yet, keep the admin list available and show
  // no prior-send metadata until the migration or first endpoint call creates it.
  let reviewById = new Map();
  try {
    const reviewRows = await sql(
      `SELECT order_id::text AS order_id,
              MAX(sent_at) AS last_sent_at,
              COUNT(*)::int AS sent_count
         FROM review_request_history
        WHERE status = 'sent'
          AND order_id::text IN (${placeholders})
        GROUP BY order_id`,
      ids,
    );
    reviewById = new Map(reviewRows.map((row) => [String(row.order_id), row]));
  } catch (error) {
    if (String(error?.code || '') !== '42P01') {
      console.warn('[get-orders] review-request metadata unavailable', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return orders.map((order) => {
    const payment = paymentById.get(String(order.id));
    const review = reviewById.get(String(order.id));
    if (!payment) return order;

    const combinedPaymentState = {
      ...order,
      ...payment,
    };
    const paymentAdjustedStatus = String(order.status || '').toLowerCase() === 'pending'
      && hasCompletedPayPalPaymentEvidence(combinedPaymentState)
      ? 'paid'
      : order.status;
    const effectiveStatus = deriveFulfillmentStatus({ ...order, status: paymentAdjustedStatus });

    const reportingCustomerEmail = normalizeReportingCustomerEmail(order.email)
      || normalizeReportingCustomerEmail(payment.reporting_customer_email)
      || normalizeReportingCustomerEmail(order.reporting_customer_email);

    return {
      ...order,
      status: effectiveStatus,
      payment_method: payment.payment_method || order.payment_method || null,
      paypal_order_id: payment.paypal_order_id || order.paypal_order_id || null,
      paypal_capture_id: payment.paypal_capture_id || order.paypal_capture_id || null,
      ...(options.includeStripeReferences ? {
        stripe_payment_intent_id: payment.stripe_payment_intent_id || order.stripe_payment_intent_id || null,
        stripe_charge_id: payment.stripe_charge_id || order.stripe_charge_id || null,
      } : {}),
      stripe_wallet_type: payment.stripe_wallet_type || order.stripe_wallet_type || null,
      is_test_order: payment.is_test_order === true || payment.is_test_order === 'true' || order.is_test_order === true,
      test_order_reason: payment.test_order_reason || order.test_order_reason || null,
      payment_reconciliation_status: payment.payment_reconciliation_status || order.payment_reconciliation_status || null,
      confirmation_email_status: payment.confirmation_email_status || order.confirmation_email_status || null,
      confirmation_emailed_at: payment.confirmation_emailed_at || order.confirmation_emailed_at || null,
      admin_notification_status: payment.admin_notification_status || order.admin_notification_status || null,
      admin_notification_sent_at: payment.admin_notification_sent_at || order.admin_notification_sent_at || null,
      production_email_status: payment.production_email_status || order.production_email_status || null,
      production_email_sent: payment.production_email_sent === 'true' || order.production_email_sent === true,
      production_email_sent_at: payment.production_email_sent_at || order.production_email_sent_at || null,
      shipping_notification_status: payment.shipping_notification_status || order.shipping_notification_status || null,
      shipping_notification_sent: payment.shipping_notification_sent === 'true' || order.shipping_notification_sent === true,
      shipping_notification_sent_at: payment.shipping_notification_sent_at || order.shipping_notification_sent_at || null,
      // Reporting identity is deliberately separate from the order's contact
      // email. Historical signed-in rows can have no orders.email even though
      // their verified profile still identifies the customer.
      reporting_customer_email: reportingCustomerEmail,
      review_request_customer_email: reportingCustomerEmail
        || order.review_request_customer_email
        || null,
      review_request_last_sent_at: review?.last_sent_at || null,
      review_request_sent_count: Number(review?.sent_count || 0),
    };
  });
}

function requestedAdminPageSize(query = {}) {
  const parsed = Number.parseInt(String(query.page_size || PAGE_SIZE), 10);
  return Math.min(MAX_ADMIN_REPORT_PAGE_SIZE, Math.max(1, Number.isFinite(parsed) ? parsed : PAGE_SIZE));
}

function parseAdminReportRequest(query = {}) {
  const page = Math.min(
    MAX_ADMIN_PAGE,
    Math.max(1, Number.parseInt(String(query.page || '1'), 10) || 1),
  );
  const pageSize = requestedAdminPageSize(query);
  const search = String(query.search || '').trim().toLowerCase().slice(0, 200);
  const rawStart = String(query.start || '').trim();
  const rawEnd = String(query.end || '').trim();
  if (Boolean(rawStart) !== Boolean(rawEnd)) {
    return { error: 'Both start and end are required for a bounded period' };
  }

  let start = null;
  let end = null;
  if (rawStart && rawEnd) {
    const startDate = new Date(rawStart);
    const endDate = new Date(rawEnd);
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())
        || endDate.getTime() <= startDate.getTime()) {
      return { error: 'Invalid order reporting period' };
    }
    start = startDate.toISOString();
    end = endDate.toISOString();
  }

  return {
    page,
    pageSize,
    search,
    start,
    end,
    summaryOnly: String(query.summary || '') === '1',
  };
}

const asInteger = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
};

const asRate = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

function normalizeAdminSummary(row = {}) {
  return {
    metrics: {
      totalOrders: asInteger(row.total_orders),
      grossSalesCents: asInteger(row.gross_sales_cents),
      averageOrderValueCents: asInteger(row.average_order_value_cents),
      recordedRefundsCents: asInteger(row.recorded_refunds_cents),
      netSalesCents: asInteger(row.net_sales_cents),
      newCustomers: asInteger(row.new_customers),
      repeatCustomers: asInteger(row.repeat_customers),
      repeatRate: asRate(row.repeat_rate),
      identifiedCustomers: asInteger(row.identified_customers),
    },
    overview: {
      totalOrders: asInteger(row.overview_total_orders),
      inProductionOrders: asInteger(row.overview_in_production_orders),
      shippedOrders: asInteger(row.overview_shipped_orders),
      pendingOrders: asInteger(row.overview_pending_orders),
      refundedOrders: asInteger(row.overview_refunded_orders),
      totalRevenueCents: asInteger(row.overview_total_revenue_cents),
      refundedRevenueCents: asInteger(row.overview_refunded_revenue_cents),
    },
  };
}

function pageOrderIds(row = {}) {
  let entries = row.page_orders;
  if (typeof entries === 'string') {
    try { entries = JSON.parse(entries); } catch { entries = []; }
  }
  return Array.isArray(entries)
    ? entries.map((entry) => String(entry?.id || '')).filter((id) => UUID_PATTERN.test(id))
    : [];
}

function normalizeAdminListOrders(rows = []) {
  return rows.map((row) => {
    let items = row.items;
    if (typeof items === 'string') {
      try { items = JSON.parse(items); } catch { items = []; }
    }
    if (!Array.isArray(items)) items = [];
    const itemCount = Math.max(items.length, asInteger(row.item_count));
    const subtotalCents = asInteger(row.subtotal_cents);
    const taxCents = asInteger(row.tax_cents);
    const totalCents = asInteger(row.total_cents);
    const saturdayFeeCents = asInteger(row.saturday_fee_cents);
    const storedSameDayFeeCents = asInteger(row.same_day_fee_cents);
    const residual = totalCents - subtotalCents - taxCents - saturdayFeeCents;
    const inferredSameDayFeeCents = storedSameDayFeeCents > 0
      ? storedSameDayFeeCents
      : (residual > 0 && String(row.status || '').toLowerCase() === 'paid' ? residual : 0);
    return {
      id: String(row.id),
      user_id: row.user_id || null,
      email: row.email || null,
      customer_name: row.customer_name || null,
      customer_first_name: row.customer_first_name || null,
      customer_phone: row.customer_phone || null,
      subtotal_cents: subtotalCents,
      tax_cents: taxCents,
      total_cents: totalCents,
      status: deriveFulfillmentStatus(row),
      currency: 'USD',
      created_at: row.created_at,
      tracking_number: row.tracking_number || null,
      tracking_numbers: null,
      trackingNumbers: null,
      tracking_carrier: row.tracking_number ? 'fedex' : null,
      shipping_name: row.shipping_name || null,
      shipping_street: row.shipping_street || null,
      shipping_street2: row.shipping_street2 || null,
      shipping_city: row.shipping_city || null,
      shipping_state: row.shipping_state || null,
      shipping_zip: row.shipping_zip || null,
      shipping_country: row.shipping_country || null,
      shippingAddress: {
        name: row.shipping_name || row.customer_name || null,
        line1: row.shipping_street || null,
        line2: row.shipping_street2 || null,
        city: row.shipping_city || null,
        state: row.shipping_state || null,
        postalCode: row.shipping_zip || null,
        country: row.shipping_country || null,
      },
      applied_discount_cents: asInteger(row.applied_discount_cents),
      applied_discount_label: row.applied_discount_label || '',
      applied_discount_type: row.applied_discount_type || 'none',
      discount_code: row.discount_code || null,
      production_email_sent: row.production_email_sent === true,
      production_email_sent_at: row.production_email_sent_at || null,
      production_email_status: row.production_email_status || 'pending',
      shipping_notification_sent: row.shipping_notification_sent === true,
      shipping_notification_sent_at: row.shipping_notification_sent_at || null,
      shipping_notification_status: row.shipping_notification_status || 'pending',
      confirmation_email_status: row.confirmation_email_status || 'pending',
      confirmation_emailed_at: row.confirmation_emailed_at || null,
      payment_method: row.payment_method || null,
      payment_reconciliation_status: row.payment_reconciliation_status || null,
      paypal_order_id: row.paypal_order_id || null,
      paypal_capture_id: row.paypal_capture_id || null,
      stripe_payment_intent_id: row.stripe_payment_intent_id || null,
      stripe_charge_id: row.stripe_charge_id || null,
      stripe_wallet_type: row.stripe_wallet_type || null,
      is_test_order: row.is_test_order === true,
      test_order_reason: row.test_order_reason || null,
      same_day_hit_service: row.same_day_hit_service === true || inferredSameDayFeeCents > 0,
      saturday_delivery: row.saturday_delivery === true,
      same_day_fee_cents: inferredSameDayFeeCents,
      saturday_fee_cents: saturdayFeeCents,
      items,
      item_count: itemCount,
      items_truncated: itemCount > items.length,
      admin_detail_loaded: false,
    };
  });
}

async function loadAdminReportData({ event, sql, request }) {
  const offset = (request.page - 1) * request.pageSize;
  // Settlement recovery is owned by the durable scheduled background queue.
  // This reporting path performs no provider I/O and has no payment side effects.
  const [pageRows, summaryRows] = await Promise.all([
    sql(buildAdminPageQuery(), [
      request.start,
      request.end,
      request.search,
      request.pageSize,
      offset,
    ]),
    sql(buildAdminSummaryQuery(), [request.start, request.end]),
  ]);

  const pageRow = pageRows[0] || {};
  const ids = pageOrderIds(pageRow);
  const totalItems = Math.max(0, asInteger(pageRow.total_items));
  const totalPages = Math.max(1, Math.ceil(totalItems / request.pageSize));
  let orders = [];

  if (!request.summaryOnly && ids.length) {
    const rawOrders = normalizeAdminListOrders(await sql(
      buildAdminHydrationQuery(),
      [ids, ADMIN_LIST_ITEM_LIMIT],
    ));

    let enrichedOrders = rawOrders;
    try {
      enrichedOrders = await enrichOrderPaymentMetadata(sql, rawOrders, {
        includeStripeReferences: true,
        event,
        reconcilePendingPayments: false,
      });
    } catch (error) {
      console.error('[get-orders] bounded page enrichment failed closed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // The page query already rejects every marked test/deploy-preview row.
    // Do not apply the paid-only visibility helper here: historical Admin
    // records can use legacy, canceled, failed, or pending statuses and still
    // need to remain inspectable. Period business metrics are calculated from
    // the separate successful/refunded CTEs above.
    const byId = new Map(
      enrichedOrders
        .filter((order) => isAdminListableOrder(order))
        .map((order) => [String(order.id), order]),
    );
    orders = ids.map((id) => byId.get(id)).filter(Boolean);
  }

  const summary = normalizeAdminSummary(summaryRows[0] || {});
  return {
    orders,
    pagination: {
      page: request.page,
      pageSize: request.pageSize,
      totalItems,
      totalPages,
      hasPrevious: request.page > 1,
      hasNext: request.page < totalPages,
    },
    ...summary,
    period: { start: request.start, endExclusive: request.end },
    search: request.search,
    summaryOnly: request.summaryOnly,
  };
}

const handleRequest = async (event, context) => {
  const query = event?.queryStringParameters || {};
  const userId = String(query.user_id || '').trim();
  const requestedPage = Math.max(1, Number.parseInt(String(query.page || '1'), 10) || 1);
  const isAdminListRequest = !userId;
  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL || process.env.DATABASE_URL;

  if (isAdminListRequest) {
    if (event?.httpMethod === 'OPTIONS') return fetchLegacyOrdersPage(event, context, 1);
    if (event?.httpMethod && event.httpMethod !== 'GET') return fetchLegacyOrdersPage(event, context, 1);

    const session = getSession(event);
    if (!session?.admin) return unauthorized('Verified administrator session required');

    const request = parseAdminReportRequest(query);
    if (request.error) {
      return {
        statusCode: 400,
        headers: PRIVATE_ORDER_RESPONSE_HEADERS,
        body: JSON.stringify({ error: request.error }),
      };
    }
    if (!dbUrl) {
      return {
        statusCode: 500,
        headers: PRIVATE_ORDER_RESPONSE_HEADERS,
        body: JSON.stringify({ error: 'Order reporting is temporarily unavailable' }),
      };
    }

    try {
      const report = await loadAdminReportData({
        event,
        sql: neon(dbUrl),
        request,
      });
      let body = report;
      if (String(query.history_scan || '') === '1') {
        body = {
          orders: report.orders,
          hasMore: report.pagination.hasNext,
          page: report.pagination.page,
        };
      } else if (String(query.admin_report || '') !== '1') {
        body = report.orders;
      }
      return {
        statusCode: 200,
        headers: PRIVATE_ORDER_RESPONSE_HEADERS,
        body: JSON.stringify(body),
      };
    } catch (error) {
      console.error('[get-orders] bounded Admin report failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        statusCode: 500,
        headers: PRIVATE_ORDER_RESPONSE_HEADERS,
        body: JSON.stringify({ error: 'Failed to fetch orders' }),
      };
    }
  }

  const sql = dbUrl ? neon(dbUrl) : null;
  const response = await fetchLegacyOrdersPage(event, context, requestedPage);
  const statusCode = Number(response?.statusCode || 500);
  if (statusCode < 200 || statusCode >= 300) return response;

  const orders = parseOrders(response);
  if (!orders || orders.length === 0 || !sql) return response;

  try {
    response.body = JSON.stringify(await enrichOrderPaymentMetadata(sql, orders, {
      event,
      reconcilePendingPayments: false,
    }));
  } catch (error) {
    console.error('[get-orders] metadata enrichment failed; returning base user order response', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return response;
};

const handler = async (event, context) => secureOrderResponse(await handleRequest(event, context));

export const _test = {
  PAYMENT_BUILD,
  buildAdminHydrationQuery,
  buildAdminPageQuery,
  buildAdminSummaryQuery,
  enrichOrderPaymentMetadata,
  loadAdminReportData,
  normalizeAdminSummary,
  normalizeAdminListOrders,
  deriveFulfillmentStatus,
  hasSavedTracking,
  normalizeReportingCustomerEmail,
  pageOrderIds,
  parseAdminReportRequest,
  parseOrders,
  reportingCustomerEmailSql,
  requestedAdminPageSize,
  secureOrderResponse,
  validReportingEmailSql,
};
export default withLambda(handler);
