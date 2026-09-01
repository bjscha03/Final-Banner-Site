import { neon } from '@neondatabase/serverless';
import { withLambda } from '@netlify/aws-lambda-compat';
import serverAuth from './_shared/server-auth.cjs';
import customerAnalytics from './_shared/admin-customers.cjs';

const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
};

const reply = (statusCode, body) => ({
  statusCode,
  headers,
  body: JSON.stringify(body),
});

const outboundSuppressionReasonsSql = Array.from(customerAnalytics.OUTBOUND_SUPPRESSION_REASONS)
  .map((reason) => `'${String(reason).replace(/'/g, "''")}'`)
  .join(',');
const completedOrderStatusesSql = Array.from(customerAnalytics.COMPLETED_STATUSES)
  .map((status) => `'${String(status).replace(/'/g, "''")}'`)
  .join(',');
const settledIdentityStatusesSql = Array.from(customerAnalytics.SETTLED_IDENTITY_STATUSES)
  .map((status) => `'${String(status).replace(/'/g, "''")}'`)
  .join(',');

const suppressionPredicate = (suppressionState) => {
  // A required-schema outage fails closed without referencing the missing
  // relation, allowing the non-marketing analytics to remain available.
  if (suppressionState?.complete !== true) return 'TRUE';
  const clauses = [
    `EXISTS (
       SELECT 1
         FROM recovery_email_suppressions recovery
        WHERE recovery.active = TRUE
          AND recovery.normalized_email = rollup.email
     )`,
    `EXISTS (
       SELECT 1
         FROM outbound_suppressions outbound
        WHERE outbound.active = TRUE
          AND LOWER(outbound.reason) IN (${outboundSuppressionReasonsSql})
          AND (
            (LOWER(outbound.scope) = 'email' AND outbound.normalized_value = rollup.email)
            OR (
              LOWER(outbound.scope) IN ('email_domain', 'company_domain')
              AND outbound.normalized_value = SPLIT_PART(rollup.email, '@', 2)
            )
          )
     )`,
    `EXISTS (
       SELECT 1
         FROM trade_show_email_unsubscribes trade_show
        WHERE trade_show.normalized_email = rollup.email
     )`,
    `COALESCE((
       SELECT capture.consent
         FROM email_captures capture
        WHERE LOWER(TRIM(capture.email)) = rollup.email
        ORDER BY capture.captured_at DESC, capture.created_at DESC
        LIMIT 1
     ), TRUE) = FALSE`,
  ];
  if (suppressionState.includeNewsletter !== false) {
    clauses.push(`EXISTS (
       SELECT 1
         FROM newsletter newsletter_status
        WHERE LOWER(TRIM(newsletter_status.email)) = rollup.email
          AND newsletter_status.subscribed = FALSE
     )`);
  }
  return clauses.join('\n             OR ');
};

const orderEmailCandidateSql = "NULLIF(LOWER(TRIM(to_jsonb(o)->>'email')), '')";
const profileEmailCandidateSql = "NULLIF(LOWER(TRIM(to_jsonb(p)->>'email')), '')";
const rawOrderStatusSql = "LOWER(TRIM(COALESCE(o.status::text, '')))";
export const EFFECTIVE_ORDER_STATUS_SQL = `CASE
  WHEN ${rawOrderStatusSql} = 'pending'
   AND (
     NULLIF(TRIM(to_jsonb(o)->>'paypal_capture_id'), '') IS NOT NULL
     OR (
       LOWER(TRIM(COALESCE(to_jsonb(o)->>'payment_method', ''))) = 'paypal'
       AND LOWER(TRIM(COALESCE(to_jsonb(o)->>'payment_reconciliation_status', ''))) = 'complete'
     )
   ) THEN 'paid'
  ELSE ${rawOrderStatusSql}
END`;
const validCustomerEmailSql = (candidate) => `(
  ${candidate} IS NOT NULL
  AND LENGTH(${candidate}) <= 254
  AND ${candidate} ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'
  AND SPLIT_PART(${candidate}, '@', 1) <> ALL (
    ARRAY['customer','guest','guestcustomer','noemail','none','noreply','preview','test','unknown']::text[]
  )
  AND SPLIT_PART(${candidate}, '@', 2) <> ALL (
    ARRAY['example.com','example.net','example.org','example.test','invalid','localhost','test.com']::text[]
  )
  AND SPLIT_PART(${candidate}, '@', 2) !~ '\\.(invalid|local|test)$'
  AND NOT (
    SPLIT_PART(${candidate}, '@', 2) = 'bannersonthefly.com'
    AND SPLIT_PART(${candidate}, '@', 1) ~ '^(guest|preview|test)[-_+]'
  )
)`;
export const CUSTOMER_EMAIL_IDENTITY_SQL = `COALESCE(
  CASE WHEN ${validCustomerEmailSql(orderEmailCandidateSql)} THEN ${orderEmailCandidateSql} END,
  CASE WHEN ${validCustomerEmailSql(profileEmailCandidateSql)} THEN ${profileEmailCandidateSql} END
)`;

export const buildCustomerAnalyticsCtes = (
  suppressionState = { complete: true, includeNewsletter: true },
) => `
  WITH normalized_orders AS (
    SELECT o.id::text AS id,
           ${CUSTOMER_EMAIL_IDENTITY_SQL} AS email,
           COALESCE(
             NULLIF(TRIM(to_jsonb(o)->>'customer_name'), ''),
             NULLIF(TRIM(to_jsonb(o)->>'shipping_name'), ''),
             NULLIF(TRIM(to_jsonb(p)->>'full_name'), '')
           ) AS customer_name,
           NULLIF(TRIM(to_jsonb(o)->>'customer_first_name'), '') AS customer_first_name,
           COALESCE(NULLIF(TRIM(to_jsonb(o)->>'order_number'), ''), o.id::text) AS order_number,
           GREATEST(COALESCE(o.total_cents, 0), 0)::bigint AS total_cents,
           ${EFFECTIVE_ORDER_STATUS_SQL} AS status,
           o.created_at,
           CASE
             WHEN LOWER(COALESCE(to_jsonb(o)->>'is_test_order', 'false')) = 'true' THEN TRUE
             ELSE FALSE
           END AS is_test_order,
           LOWER(TRIM(COALESCE(to_jsonb(o)->>'payment_method', ''))) AS payment_method
      FROM orders o
      LEFT JOIN profiles p ON p.id = o.user_id
  ), valid_orders AS (
    SELECT *
      FROM normalized_orders
     WHERE email IS NOT NULL
       AND is_test_order = FALSE
       AND payment_method <> 'admin_deploy_preview_test'
       AND LENGTH(email) <= 254
       AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'
       AND SPLIT_PART(email, '@', 1) <> ALL (
         ARRAY['customer','guest','guestcustomer','noemail','none','noreply','preview','test','unknown']::text[]
       )
       AND SPLIT_PART(email, '@', 2) <> ALL (
         ARRAY['example.com','example.net','example.org','example.test','invalid','localhost','test.com']::text[]
       )
       AND SPLIT_PART(email, '@', 2) !~ '\\.(invalid|local|test)$'
       AND NOT (
         SPLIT_PART(email, '@', 2) = 'bannersonthefly.com'
         AND SPLIT_PART(email, '@', 1) ~ '^(guest|preview|test)[-_+]'
       )
  ), canonical_names AS (
    SELECT DISTINCT ON (email)
           email, customer_name, customer_first_name
      FROM valid_orders
     WHERE status = ANY (ARRAY[${settledIdentityStatusesSql}]::text[])
       AND customer_name IS NOT NULL
       AND LOWER(customer_name) <> ALL (ARRAY['guest','guest customer','customer']::text[])
     ORDER BY email, created_at DESC NULLS LAST, id DESC
  ), customer_rollups AS (
    SELECT email,
           COUNT(*) FILTER (
             WHERE status = ANY (ARRAY[${completedOrderStatusesSql}]::text[])
           )::integer AS completed_order_count,
           COALESCE(SUM(total_cents) FILTER (
             WHERE status = ANY (ARRAY[${completedOrderStatusesSql}]::text[])
           ), 0)::bigint AS lifetime_revenue_cents,
           MIN(created_at) FILTER (
             WHERE status = ANY (ARRAY[${completedOrderStatusesSql}]::text[])
           ) AS first_order_at,
           MAX(created_at) FILTER (
             WHERE status = ANY (ARRAY[${completedOrderStatusesSql}]::text[])
           ) AS last_order_at,
           MAX(created_at) AS latest_activity_at,
           COUNT(*) FILTER (
             WHERE status = ANY (ARRAY[${completedOrderStatusesSql}]::text[])
               AND (
                 $1::timestamptz IS NULL
                 OR (created_at >= $1::timestamptz AND created_at < $2::timestamptz)
               )
           )::integer AS period_order_count,
           COALESCE(SUM(total_cents) FILTER (
             WHERE status = ANY (ARRAY[${completedOrderStatusesSql}]::text[])
               AND (
                 $1::timestamptz IS NULL
                 OR (created_at >= $1::timestamptz AND created_at < $2::timestamptz)
               )
           ), 0)::bigint AS period_revenue_cents,
           BOOL_OR(status = ANY (ARRAY[${settledIdentityStatusesSql}]::text[])) AS has_settled_order,
           BOOL_OR(POSITION($3::text IN LOWER(order_number)) > 0) AS order_search_match
      FROM valid_orders
     GROUP BY email
  ), population_base AS (
    SELECT rollup.email,
           names.customer_name,
           names.customer_first_name,
           rollup.completed_order_count,
           rollup.lifetime_revenue_cents,
           rollup.first_order_at,
           rollup.last_order_at,
           rollup.period_order_count,
           rollup.period_revenue_cents,
           COALESCE(rollup.last_order_at, rollup.latest_activity_at, TO_TIMESTAMP(0)) AS sort_at,
           (
             EXTRACT(EPOCH FROM COALESCE(rollup.last_order_at, rollup.latest_activity_at, TO_TIMESTAMP(0)))
             * 1000000
           )::bigint AS sort_at_micros,
           CASE
             WHEN rollup.completed_order_count >= 2 THEN 'repeat'
             WHEN rollup.completed_order_count = 1 THEN 'first_time'
             ELSE 'no_completed_order'
           END AS segment,
           (
             rollup.last_order_at IS NOT NULL
             AND rollup.last_order_at < $5::timestamptz
           ) AS is_lapsed,
           (
             $4::boolean = TRUE
             AND NOT (${suppressionPredicate(suppressionState)})
           ) AS marketing_eligible
      FROM customer_rollups rollup
      LEFT JOIN canonical_names names ON names.email = rollup.email
     WHERE rollup.has_settled_order = TRUE
       AND ($1::timestamptz IS NULL OR rollup.period_order_count > 0)
       AND (
         $3::text = ''
         OR POSITION($3::text IN rollup.email) > 0
         OR POSITION($3::text IN LOWER(COALESCE(names.customer_name, ''))) > 0
         OR POSITION($3::text IN LOWER(COALESCE(names.customer_first_name, ''))) > 0
         OR rollup.order_search_match
       )
  ), population AS (
    SELECT * FROM population_base
  ), selected_population AS (
    SELECT *
      FROM population
     WHERE $6::text = 'all'
        OR ($6::text = 'first_time' AND segment = 'first_time')
        OR ($6::text = 'repeat' AND segment = 'repeat')
        OR ($6::text = 'lapsed' AND is_lapsed = TRUE)
  )
`;

export const CUSTOMER_ANALYTICS_CTES = buildCustomerAnalyticsCtes();

export const CUSTOMER_STATS_QUERY = `${CUSTOMER_ANALYTICS_CTES}
  SELECT population_stats.*, filtered_stats.*
    FROM (
      SELECT COUNT(*)::bigint AS all_count,
             COUNT(*) FILTER (WHERE segment = 'first_time')::bigint AS first_time_count,
             COUNT(*) FILTER (WHERE segment = 'repeat')::bigint AS repeat_count,
             COUNT(*) FILTER (WHERE is_lapsed = TRUE)::bigint AS lapsed_count,
             COUNT(*) FILTER (WHERE marketing_eligible = TRUE)::bigint AS marketing_eligible_count,
             COUNT(*) FILTER (WHERE marketing_eligible = FALSE)::bigint AS marketing_excluded_count,
             COALESCE(SUM(lifetime_revenue_cents), 0)::bigint AS lifetime_revenue_cents,
             COALESCE(SUM(period_revenue_cents), 0)::bigint AS period_revenue_cents
        FROM population
    ) population_stats
    CROSS JOIN (
      SELECT COUNT(*)::bigint AS filtered_count,
             COUNT(*) FILTER (WHERE marketing_eligible = TRUE)::bigint AS filtered_marketing_eligible_count,
             COUNT(*) FILTER (WHERE marketing_eligible = FALSE)::bigint AS filtered_marketing_excluded_count,
             COALESCE(SUM(lifetime_revenue_cents), 0)::bigint AS filtered_lifetime_revenue_cents,
             COALESCE(SUM(period_revenue_cents), 0)::bigint AS filtered_period_revenue_cents
        FROM selected_population
    ) filtered_stats
`;

export const CUSTOMER_PAGE_QUERY = `${CUSTOMER_ANALYTICS_CTES}
  SELECT email, LEFT(customer_name, 500) AS customer_name,
         LEFT(customer_first_name, 160) AS customer_first_name,
         completed_order_count, lifetime_revenue_cents,
         first_order_at, last_order_at, period_order_count,
         period_revenue_cents, segment, is_lapsed,
         marketing_eligible, sort_at
   FROM selected_population
   ORDER BY sort_at DESC, email ASC
   LIMIT $7 OFFSET $8
`;

export const CUSTOMER_EXPORT_PAGE_QUERY = `${CUSTOMER_ANALYTICS_CTES}
  SELECT email, LEFT(customer_name, 500) AS customer_name,
         LEFT(customer_first_name, 160) AS customer_first_name,
         completed_order_count, lifetime_revenue_cents,
         first_order_at, last_order_at, period_order_count,
         period_revenue_cents, segment, is_lapsed,
         marketing_eligible, sort_at, sort_at_micros::text AS sort_at_micros
    FROM selected_population
   WHERE marketing_eligible = TRUE
     AND (
       $7::bigint IS NULL
       OR sort_at_micros < $7::bigint
       OR (sort_at_micros = $7::bigint AND email > $8::text)
     )
   ORDER BY sort_at DESC, email ASC
   LIMIT $9
`;

export const buildCustomerQueries = (suppressionState) => {
  const ctes = buildCustomerAnalyticsCtes(suppressionState);
  return {
    // Use a function replacer so `$` sequences inside SQL regexes are copied
    // literally instead of being interpreted as JavaScript replacement tokens.
    stats: CUSTOMER_STATS_QUERY.replace(CUSTOMER_ANALYTICS_CTES, () => ctes),
    page: CUSTOMER_PAGE_QUERY.replace(CUSTOMER_ANALYTICS_CTES, () => ctes),
    exportPage: CUSTOMER_EXPORT_PAGE_QUERY.replace(CUSTOMER_ANALYTICS_CTES, () => ctes),
  };
};

export const CUSTOMER_DETAIL_QUERY = `
  SELECT o.id::text AS id,
         LEFT(COALESCE(NULLIF(TRIM(to_jsonb(o)->>'order_number'), ''), o.id::text), 160) AS order_number,
         GREATEST(COALESCE(o.total_cents, 0), 0)::bigint AS total_cents,
         LEFT(${EFFECTIVE_ORDER_STATUS_SQL}, 80) AS status,
         o.created_at
   FROM orders o
    LEFT JOIN profiles p ON p.id = o.user_id
   WHERE ${CUSTOMER_EMAIL_IDENTITY_SQL} = $1
     AND LOWER(COALESCE(to_jsonb(o)->>'is_test_order', 'false')) <> 'true'
     AND LOWER(TRIM(COALESCE(to_jsonb(o)->>'payment_method', ''))) <> 'admin_deploy_preview_test'
   ORDER BY o.created_at DESC NULLS LAST, o.id DESC
   LIMIT $2 OFFSET $3
`;

export const CUSTOMER_DETAIL_COUNT_QUERY = `
  SELECT COUNT(*)::bigint AS total
   FROM orders o
    LEFT JOIN profiles p ON p.id = o.user_id
   WHERE ${CUSTOMER_EMAIL_IDENTITY_SQL} = $1
     AND LOWER(COALESCE(to_jsonb(o)->>'is_test_order', 'false')) <> 'true'
     AND LOWER(TRIM(COALESCE(to_jsonb(o)->>'payment_method', ''))) <> 'admin_deploy_preview_test'
`;

let neonFactory = neon;

const normalizeOptions = (query, now = new Date()) => {
  const segment = customerAnalytics.CUSTOMER_SEGMENTS.has(String(query.segment || ''))
    ? String(query.segment)
    : 'all';
  const lapsedDays = customerAnalytics.LAPSED_DAY_OPTIONS.has(Number(query.lapsed_days))
    ? Number(query.lapsed_days)
    : 180;
  const search = String(query.q || '').trim().toLowerCase().slice(0, 160);
  const range = customerAnalytics.resolvePeriodRange(
    String(query.period || 'all_time'),
    String(query.start || ''),
    String(query.end || ''),
    now,
  );
  return {
    segment,
    lapsedDays,
    search,
    range,
    lapsedBefore: new Date(now.getTime() - lapsedDays * 24 * 60 * 60 * 1000),
  };
};

const queryParameters = (options, suppressionState) => [
  options.range.start?.toISOString() || null,
  options.range.endExclusive?.toISOString() || null,
  options.search,
  suppressionState.complete === true,
  options.lapsedBefore.toISOString(),
  options.segment,
];

const customerFromRow = (row, suppressionState) => customerAnalytics.customerFromSummaryRow(row, suppressionState);

const normalizeCursorMicros = (value) => {
  const text = String(value ?? '').trim();
  if (!/^-?\d{1,19}$/.test(text)) throw new Error('invalid');
  const numeric = BigInt(text);
  if (numeric < -9_223_372_036_854_775_808n || numeric > 9_223_372_036_854_775_807n) {
    throw new Error('invalid');
  }
  return numeric.toString();
};

const encodeExportCursor = (row) => Buffer.from(JSON.stringify({
  sortAtMicros: normalizeCursorMicros(row.sort_at_micros),
  email: customerAnalytics.normalizeEmail(row.email),
})).toString('base64url');

const parseExportCursor = (value) => {
  const encoded = String(value || '');
  if (!encoded) return null;
  if (encoded.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    const error = new Error('Invalid export cursor');
    error.code = 'INVALID_CURSOR';
    throw error;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    const sortAtMicros = normalizeCursorMicros(parsed.sortAtMicros);
    const email = customerAnalytics.normalizeEmail(parsed.email);
    if (!customerAnalytics.isValidCustomerEmail(email)) throw new Error('invalid');
    return { sortAtMicros, email };
  } catch {
    const error = new Error('Invalid export cursor');
    error.code = 'INVALID_CURSOR';
    throw error;
  }
};

export const loadCustomerStats = async (sql, parameters, query = CUSTOMER_STATS_QUERY) => {
  const rows = await sql(query, parameters);
  return rows[0] || {};
};

export const loadCustomerPage = (sql, parameters, pagination, query = CUSTOMER_PAGE_QUERY) => sql(
  query,
  [...parameters, pagination.pageSize, pagination.offset],
);

export const loadCustomerExportPage = (sql, parameters, cursor, pageSize, query = CUSTOMER_EXPORT_PAGE_QUERY) => sql(
  query,
  [...parameters, cursor?.sortAtMicros || null, cursor?.email || '', pageSize],
);

export const loadCustomerOrderRows = async (sql, email, pagination) => {
  const [countRows, rows] = await Promise.all([
    sql(CUSTOMER_DETAIL_COUNT_QUERY, [email]),
    sql(CUSTOMER_DETAIL_QUERY, [email, pagination.pageSize, pagination.offset]),
  ]);
  return { total: Math.max(0, Number(countRows[0]?.total) || 0), rows };
};

const detailOrder = (row) => {
  const status = customerAnalytics.resolveEffectiveOrderStatus(row).slice(0, 80) || 'unknown';
  return {
    id: String(row.id || ''),
    orderNumber: String(row.order_number || row.id || '').slice(0, 160),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    status,
    totalCents: Math.max(0, Math.round(Number(row.total_cents) || 0)),
    completed: customerAnalytics.COMPLETED_STATUSES.has(status),
  };
};

async function handleList(sql, query, suppressionState, now) {
  const options = normalizeOptions(query, now);
  const requestedPagination = customerAnalytics.resolveListPagination(query.page, query.page_size);
  const parameters = queryParameters(options, suppressionState);
  const queries = buildCustomerQueries(suppressionState);
  const statsRow = await loadCustomerStats(sql, parameters, queries.stats);
  const stats = customerAnalytics.statsFromRow(statsRow);
  const filteredSummary = customerAnalytics.filteredSummaryFromRow(statsRow);
  const totalPages = Math.max(1, Math.ceil(filteredSummary.total / requestedPagination.pageSize));
  const page = Math.min(requestedPagination.page, totalPages);
  const pagination = {
    page,
    pageSize: requestedPagination.pageSize,
    offset: (page - 1) * requestedPagination.pageSize,
  };
  const rows = await loadCustomerPage(sql, parameters, pagination, queries.page);
  return {
    ok: true,
    generatedAt: now.toISOString(),
    customers: rows.map((row) => customerFromRow(row, suppressionState)).filter(Boolean),
    stats,
    filteredSummary,
    exportSummary: {
      eligible: filteredSummary.marketingEligible,
      excluded: filteredSummary.marketingExcluded,
      suppressionDataComplete: suppressionState.complete === true,
      unavailableSources: suppressionState.unavailableSources || [],
    },
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: filteredSummary.total,
      totalPages,
      hasPrevious: pagination.page > 1,
      hasNext: pagination.page < totalPages,
    },
    filters: {
      segment: options.segment,
      period: options.range.period,
      lapsedDays: options.lapsedDays,
      start: options.range.start?.toISOString() || null,
      endExclusive: options.range.endExclusive?.toISOString() || null,
      search: options.search,
    },
  };
}

async function handleDetail(sql, query, suppressionState, now) {
  const email = customerAnalytics.normalizeEmail(query.email);
  if (!customerAnalytics.isValidCustomerEmail(email)) {
    return reply(400, { ok: false, error: 'A valid customer email is required', code: 'INVALID_CUSTOMER' });
  }
  const pagination = customerAnalytics.resolveDetailPagination(query.order_page, query.order_page_size);
  const history = await loadCustomerOrderRows(sql, email, pagination);
  if (history.total === 0) return reply(404, { ok: false, error: 'Customer history not found' });
  const totalPages = Math.max(1, Math.ceil(history.total / pagination.pageSize));
  const suppressionReasons = customerAnalytics.suppressionReasonsForEmail(suppressionState, email);
  return reply(200, {
    ok: true,
    generatedAt: now.toISOString(),
    customer: {
      email,
      marketingEligible: suppressionReasons.length === 0,
      suppressionReason: suppressionReasons.join(', '),
      suppressionReasons,
    },
    orders: history.rows.map(detailOrder),
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total: history.total,
      totalPages,
      hasMore: pagination.page < totalPages,
    },
  });
}

async function handleExport(sql, query, suppressionState, now) {
  if (suppressionState.complete !== true) {
    return reply(503, { ok: false, error: 'Suppression verification is temporarily unavailable', code: 'SUPPRESSION_UNAVAILABLE' });
  }
  const options = normalizeOptions(query, now);
  const parameters = queryParameters(options, suppressionState);
  const cursor = parseExportCursor(query.cursor);
  const pageSize = customerAnalytics.resolveExportPageSize(query.page_size);
  const queries = buildCustomerQueries(suppressionState);
  const rows = await loadCustomerExportPage(sql, parameters, cursor, pageSize, queries.exportPage);
  const customers = rows.map((row) => customerFromRow(row, suppressionState)).filter((customer) => customer?.marketingEligible);
  const nextCursor = rows.length === pageSize ? encodeExportCursor(rows.at(-1)) : null;
  return reply(200, {
    ok: true,
    generatedAt: now.toISOString(),
    suppressionCheckedAt: now.toISOString(),
    customers,
    pagination: { pageSize, nextCursor, hasMore: Boolean(nextCursor) },
  });
}

const parseVerificationEmails = (event) => {
  let input;
  try { input = JSON.parse(event.body || '{}'); } catch {
    return { response: reply(400, { ok: false, error: 'Invalid verification request' }) };
  }
  if (!Array.isArray(input.emails) || input.emails.length < 1 || input.emails.length > 250) {
    return { response: reply(400, { ok: false, error: 'Verification requires between 1 and 250 customer emails' }) };
  }
  const emails = Array.from(new Set(input.emails.map(customerAnalytics.normalizeEmail)));
  if (emails.some((email) => !customerAnalytics.isValidCustomerEmail(email))) {
    return { response: reply(400, { ok: false, error: 'Verification contains an invalid customer email' }) };
  }
  return { emails };
};

async function handleExportVerification(emails, suppressionState, now) {
  if (suppressionState.complete !== true) {
    return reply(503, { ok: false, error: 'Suppression verification is temporarily unavailable', code: 'SUPPRESSION_UNAVAILABLE' });
  }
  const eligible = emails.filter((email) => customerAnalytics.suppressionReasonsForEmail(suppressionState, email).length === 0);
  return reply(200, {
    ok: true,
    suppressionCheckedAt: now.toISOString(),
    eligible,
  });
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  const auth = serverAuth.requireAdmin(event);
  if (!auth.ok) return auth.response;

  const query = event.queryStringParameters || {};
  const mode = String(query.mode || 'list').trim().toLowerCase();
  if (event.httpMethod !== 'GET' && !(event.httpMethod === 'POST' && mode === 'verify_export')) {
    return reply(405, { ok: false, error: 'Method not allowed' });
  }

  try {
    if (mode !== 'detail' && mode !== 'verify_export') normalizeOptions(query);
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || process.env.VITE_DATABASE_URL;
    if (!dbUrl) return reply(500, { ok: false, error: 'Database configuration missing' });
    const sql = neonFactory(dbUrl);
    const now = new Date();

    if (mode === 'detail' && event.httpMethod === 'GET') {
      const email = customerAnalytics.normalizeEmail(query.email);
      if (!customerAnalytics.isValidCustomerEmail(email)) {
        return reply(400, { ok: false, error: 'A valid customer email is required', code: 'INVALID_CUSTOMER' });
      }
      const suppressionState = await customerAnalytics.loadSuppressionIndex(sql, [email]);
      return handleDetail(sql, query, suppressionState, now);
    }
    if (mode === 'verify_export' && event.httpMethod === 'POST') {
      const parsed = parseVerificationEmails(event);
      if (parsed.response) return parsed.response;
      const suppressionState = await customerAnalytics.loadSuppressionIndex(sql, parsed.emails);
      return handleExportVerification(parsed.emails, suppressionState, now);
    }
    if (mode === 'export' && event.httpMethod === 'GET') {
      const suppressionState = await customerAnalytics.probeSuppressionSources(sql);
      return handleExport(sql, query, suppressionState, now);
    }
    if (mode !== 'list') return reply(400, { ok: false, error: 'Unsupported customer request mode' });
    const suppressionState = await customerAnalytics.probeSuppressionSources(sql);
    return reply(200, await handleList(sql, query, suppressionState, now));
  } catch (error) {
    if (error?.code === 'INVALID_PERIOD' || error?.code === 'INVALID_CURSOR') {
      return reply(400, { ok: false, error: error.message, code: error.code });
    }
    if (error?.code === 'SUPPRESSION_INDEX_TOO_LARGE' || error?.code === 'SUPPRESSION_BATCH_TOO_LARGE') {
      return reply(503, { ok: false, error: 'Suppression verification is temporarily unavailable', code: 'SUPPRESSION_UNAVAILABLE' });
    }
    console.error('[admin-customers] failed', {
      code: error?.code || null,
      admin: auth.session.email || auth.session.sub,
    });
    return reply(500, { ok: false, error: 'Unable to load customer analytics' });
  }
}

export const _test = {
  encodeExportCursor,
  normalizeCursorMicros,
  parseExportCursor,
  normalizeOptions,
  queryParameters,
  parseVerificationEmails,
  resetDependencies() { neonFactory = neon; },
  setNeonFactory(value) { neonFactory = value; },
};

export default withLambda(handler);
