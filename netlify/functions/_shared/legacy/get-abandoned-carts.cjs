'use strict';

const { neon } = require('@neondatabase/serverless');
const { requireAdmin } = require('../server-auth.cjs');
const { ensureAbandonedCartSchema } = require('../abandoned-cart-schema.cjs');

const headers = {
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Banners-Admin-Session',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

const RECOVERY_SUPPRESSION_REASONS = new Set([
  'unsubscribe',
  'unsubscribed',
  'complaint',
  'spam_complaint',
  'hard_bounce',
  'legal',
  'blocklist',
  'manual',
  'wrong_contact',
  'duplicate',
  'provider_suppressed',
  'consent_false',
  'consent_withdrawn',
]);

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;
const MAX_ITEM_SUMMARIES = 50;
const SNAPSHOT_METADATA_KEY = '__bof_abandoned_cart_snapshot_v1';
const RETAINED_RECOVERY_ORDER_STATUSES = new Set([
  'paid',
  'in_production',
  'shipped',
  'delivered',
  'fulfilled',
]);
const OUTCOME_MINIMUM_SAMPLE_SIZE = 20;
const OUTCOME_MINIMUM_PER_OUTCOME = 5;
const KNOWN_CHECKOUT_STAGES = new Set(['cart', 'checkout', 'contact', 'payment_started']);
const SIZE_OUTCOME_BANDS = [
  { key: 'small_medium', label: 'Small / medium (<18 sq ft; below 3×6)' },
  { key: 'large_plus', label: 'Large+ (≥18 sq ft; 3×6 or larger)' },
];
const VALUE_OUTCOME_BANDS = [
  { key: '$0–$49', label: '$0–$49' },
  { key: '$50–$99', label: '$50–$99' },
  { key: '$100–$249', label: '$100–$249' },
  { key: '$250–$499', label: '$250–$499' },
  { key: '$500+', label: '$500+' },
];

const numberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const positiveInteger = (value, fallback = 0) => {
  const parsed = numberOrNull(value);
  return parsed === null ? fallback : Math.max(0, Math.round(parsed));
};

const safeString = (value, fallback = '') => String(value ?? fallback).trim();

// Migration 006 intentionally stored this historical attribution as TEXT,
// while orders.id is UUID. Compare canonical text forms so malformed legacy
// values stay non-matches instead of making PostgreSQL reject the whole report.
const recoveredOrderJoinSql = (cartAlias = 'cart', orderAlias = 'recovered_order') => (
  `${orderAlias}.id::TEXT = LOWER(NULLIF(BTRIM(${cartAlias}.recovered_order_id), ''))`
);

const recoveredOrderStatusSql = (alias = 'recovered_order') => `CASE
  WHEN LOWER(BTRIM(COALESCE(${alias}.status, ''))) = 'pending'
   AND (
     NULLIF(BTRIM(to_jsonb(${alias})->>'paypal_capture_id'), '') IS NOT NULL
     OR (
       LOWER(BTRIM(COALESCE(to_jsonb(${alias})->>'payment_method', ''))) = 'paypal'
       AND LOWER(BTRIM(COALESCE(to_jsonb(${alias})->>'payment_reconciliation_status', ''))) = 'complete'
     )
   ) THEN 'paid'
  ELSE LOWER(BTRIM(COALESCE(${alias}.status, '')))
END`;

function recoveredRevenueState(status, hasExactOrderLink) {
  if (!hasExactOrderLink) return 'unknown';
  const normalized = safeString(status).toLowerCase();
  if (normalized === 'refunded') return 'refunded';
  return RETAINED_RECOVERY_ORDER_STATUSES.has(normalized) ? 'retained' : 'unknown';
}

const formatDimension = (value) => {
  const parsed = numberOrNull(value);
  if (parsed === null) return null;
  return Number.isInteger(parsed) ? String(parsed) : String(Math.round(parsed * 100) / 100);
};

function normalizeItem(rawItem = {}) {
  const width = numberOrNull(rawItem.width_in);
  const height = numberOrNull(rawItem.height_in);
  const recordedArea = numberOrNull(rawItem.area_sqft);
  const area = recordedArea ?? (width !== null && height !== null ? (width * height) / 144 : null);
  const widthLabel = formatDimension(width);
  const heightLabel = formatDimension(height);
  const hasArtwork = rawItem.has_artwork === true || rawItem.has_artwork === 'true'
    ? true
    : rawItem.has_artwork === false || rawItem.has_artwork === 'false'
      ? false
      : null;

  return {
    product_type: safeString(rawItem.product_type, 'banner') || 'banner',
    width_in: width,
    height_in: height,
    dimensions: widthLabel && heightLabel ? `${widthLabel}\u2033 \u00d7 ${heightLabel}\u2033` : 'Unknown',
    area_sqft: area === null ? null : Math.round(area * 100) / 100,
    material: safeString(rawItem.material, 'Unknown') || 'Unknown',
    quantity: Math.max(1, positiveInteger(rawItem.quantity, 1)),
    line_total_cents: numberOrNull(rawItem.line_total_cents),
    has_artwork: hasArtwork,
  };
}

function normalizeSnapshotCoverage(row, storedItemCount) {
  const metadataPresent = row.snapshot_metadata_present === true
    || safeString(row.snapshot_metadata_present).toLowerCase() === 'true';
  if (!metadataPresent) {
    return {
      sourceItemCount: null,
      storedItemCount,
      completeness: 'unknown',
    };
  }

  const version = numberOrNull(row.snapshot_metadata_version);
  const sourceItemCount = numberOrNull(row.snapshot_source_item_count);
  const declaredStoredItemCount = numberOrNull(row.snapshot_stored_item_count);
  const completeText = safeString(row.snapshot_complete).toLowerCase();
  const declaredComplete = row.snapshot_complete === true || completeText === 'true'
    ? true
    : row.snapshot_complete === false || completeText === 'false'
      ? false
      : null;
  const valid = version === 1
    && Number.isSafeInteger(sourceItemCount)
    && sourceItemCount >= 0
    && Number.isSafeInteger(declaredStoredItemCount)
    && declaredStoredItemCount >= 0
    && sourceItemCount >= declaredStoredItemCount
    && declaredComplete !== null;

  if (!valid) {
    return {
      sourceItemCount: null,
      storedItemCount,
      completeness: 'unknown',
    };
  }

  return {
    sourceItemCount,
    storedItemCount,
    completeness: declaredComplete === true
      && sourceItemCount === declaredStoredItemCount
      && declaredStoredItemCount === storedItemCount
      ? 'complete'
      : 'incomplete',
  };
}

function normalizeCart(row, suppressionByEmail) {
  const items = Array.isArray(row.item_summaries) ? row.item_summaries.map(normalizeItem) : [];
  const storedItemCount = positiveInteger(row.stored_item_count, positiveInteger(row.item_count, items.length));
  const snapshotCoverage = normalizeSnapshotCoverage(row, storedItemCount);
  const legacyTotalCents = Math.max(0, Math.round((numberOrNull(row.total_value) || 0) * 100));
  const subtotalCents = numberOrNull(row.subtotal_cents) ?? legacyTotalCents;
  const estimatedTotalCents = numberOrNull(row.estimated_total_cents);
  const capturedValueCents = estimatedTotalCents ?? subtotalCents;
  const normalizedEmail = safeString(row.email).toLowerCase();
  const domain = normalizedEmail.includes('@') ? normalizedEmail.slice(normalizedEmail.lastIndexOf('@') + 1) : '';
  const liveSuppression = normalizedEmail
    ? suppressionByEmail.get(normalizedEmail) || (domain ? suppressionByEmail.get(`@${domain}`) : null)
    : null;
  const storedSuppression = safeString(row.recovery_suppression_reason);
  const suppressionReason = liveSuppression?.reason || storedSuppression || null;
  const suppressionRecordedAt = liveSuppression?.recordedAt || row.recovery_suppressed_at || null;
  const itemArtworkDetected = items.some((item) => item.has_artwork === true);
  const recordedArtwork = row.has_artwork === true || row.has_artwork === 'true'
    ? true
    : row.has_artwork === false || row.has_artwork === 'false'
      ? false
      : null;
  const recoveryStatus = safeString(row.recovery_status, 'active') || 'active';
  const recoveredOrderId = row.recovered_order_id ? String(row.recovered_order_id) : null;
  const recoveredOrderStatus = safeString(row.recovered_order_status).toLowerCase() || null;
  const recoveredOrderFound = row.recovered_order_found === true
    || safeString(row.recovered_order_found).toLowerCase() === 'true';
  const isRecoveredAbandonment = recoveryStatus === 'recovered' && Boolean(row.abandoned_at);

  return {
    id: String(row.id),
    user_id: row.user_id ? String(row.user_id) : null,
    session_id: row.session_id ? String(row.session_id) : null,
    customer_kind: row.user_id ? 'signed_in' : 'guest',
    customer_first_name: safeString(row.customer_first_name) || null,
    customer_last_name: safeString(row.customer_last_name) || null,
    email: safeString(row.email) || null,
    phone: safeString(row.phone) || null,
    item_count: storedItemCount,
    source_item_count: snapshotCoverage.sourceItemCount,
    stored_item_count: snapshotCoverage.storedItemCount,
    snapshot_completeness: snapshotCoverage.completeness,
    item_quantity: positiveInteger(row.item_quantity, items.reduce((sum, item) => sum + item.quantity, 0)),
    item_summaries: items,
    item_summaries_truncated: Boolean(row.item_summaries_truncated),
    subtotal_cents: subtotalCents,
    discount_cents: numberOrNull(row.discount_cents),
    tax_cents: numberOrNull(row.tax_cents),
    estimated_total_cents: estimatedTotalCents,
    captured_value_cents: capturedValueCents,
    total_value: capturedValueCents / 100,
    currency: safeString(row.currency, 'USD') || 'USD',
    checkout_stage: safeString(row.checkout_stage, 'unknown') || 'unknown',
    checkout_stage_updated_at: row.checkout_stage_updated_at || null,
    has_artwork: itemArtworkDetected ? true : recordedArtwork,
    recovery_status: recoveryStatus,
    recovery_emails_sent: positiveInteger(row.recovery_emails_sent),
    discount_code: safeString(row.discount_code) || null,
    last_recovery_email_at: row.last_recovery_email_at || null,
    recovery_suppressed_at: suppressionRecordedAt,
    recovery_suppression_reason: suppressionReason,
    recovery_email_last_error: safeString(row.recovery_email_last_error) || null,
    last_activity_at: row.last_activity_at,
    abandoned_at: row.abandoned_at || null,
    recovered_at: row.recovered_at || null,
    recovered_order_id: recoveredOrderId,
    recovered_order_status: recoveredOrderStatus,
    recovered_revenue_state: isRecoveredAbandonment
      ? recoveredRevenueState(recoveredOrderStatus, Boolean(recoveredOrderId && recoveredOrderFound))
      : null,
    created_at: row.created_at,
    first_item_thumbnail: safeString(row.first_item_thumbnail) || null,
  };
}

function topFacets(values, limit = 5) {
  const counts = new Map();
  for (const { label, count } of values) {
    const key = safeString(label, 'Unknown') || 'Unknown';
    counts.set(key, (counts.get(key) || 0) + Math.max(0, positiveInteger(count)));
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, limit);
}

function cartFacetPresence(carts, selectLabel) {
  return carts.flatMap((cart) => {
    const labels = new Set(cart.item_summaries.map(selectLabel));
    return [...labels].map((label) => ({ label, count: 1 }));
  });
}

function capturedValueBand(cents) {
  const value = Math.max(0, positiveInteger(cents));
  if (value < 5_000) return '$0–$49';
  if (value < 10_000) return '$50–$99';
  if (value < 25_000) return '$100–$249';
  if (value < 50_000) return '$250–$499';
  return '$500+';
}

function terminalOutcome(cart) {
  const stage = safeString(cart.checkout_stage).toLowerCase();
  const knownPostRolloutStage = Boolean(cart.checkout_stage_updated_at) && KNOWN_CHECKOUT_STAGES.has(stage);
  if (!knownPostRolloutStage || cart.recovery_status === 'active') return null;
  if (cart.abandoned_at) return 'abandoned';
  return cart.recovery_status === 'recovered' ? 'completed' : null;
}

function largestBannerArea(cart) {
  const areas = cart.item_summaries
    .filter((item) => safeString(item.product_type).toLowerCase() === 'banner')
    .map((item) => {
      const recordedArea = numberOrNull(item.area_sqft);
      if (recordedArea !== null && recordedArea > 0) return recordedArea;
      const width = numberOrNull(item.width_in);
      const height = numberOrNull(item.height_in);
      if (width === null || height === null) return null;
      const area = (width * height) / 144;
      return area > 0 ? area : null;
    })
    .filter((area) => area !== null);
  return areas.length ? Math.max(...areas) : null;
}

function outcomeBand(key, label, counts) {
  const count = counts.get(key) || { abandoned: 0, completed: 0 };
  const sampleSize = count.abandoned + count.completed;
  const sufficientSample = sampleSize >= OUTCOME_MINIMUM_SAMPLE_SIZE
    && count.abandoned >= OUTCOME_MINIMUM_PER_OUTCOME
    && count.completed >= OUTCOME_MINIMUM_PER_OUTCOME;
  return {
    key,
    label,
    abandonedCount: count.abandoned,
    completedCount: count.completed,
    sampleSize,
    abandonmentRate: sufficientSample ? count.abandoned / sampleSize : null,
    sufficientSample,
  };
}

function summarizeOutcomeComparison(carts) {
  const sizeCounts = new Map();
  const valueCounts = new Map();
  let terminalSampleSize = 0;
  let sizeClassifiedSampleSize = 0;
  let valueClassifiedSampleSize = 0;
  const increment = (counts, key, outcome) => {
    const current = counts.get(key) || { abandoned: 0, completed: 0 };
    current[outcome] += 1;
    counts.set(key, current);
  };

  carts.forEach((cart) => {
    const outcome = terminalOutcome(cart);
    if (!outcome) return;
    terminalSampleSize += 1;
    increment(valueCounts, capturedValueBand(cart.captured_value_cents), outcome);
    valueClassifiedSampleSize += 1;
    const largestArea = largestBannerArea(cart);
    if (largestArea !== null) {
      increment(sizeCounts, largestArea < 18 ? 'small_medium' : 'large_plus', outcome);
      sizeClassifiedSampleSize += 1;
    }
  });

  return {
    terminalSampleSize,
    minimumSampleSize: OUTCOME_MINIMUM_SAMPLE_SIZE,
    minimumOutcomeCount: OUTCOME_MINIMUM_PER_OUTCOME,
    sizeClassifiedSampleSize,
    valueClassifiedSampleSize,
    sizeBands: SIZE_OUTCOME_BANDS.map((band) => outcomeBand(band.key, band.label, sizeCounts)),
    valueBands: VALUE_OUTCOME_BANDS.map((band) => outcomeBand(band.key, band.label, valueCounts)),
  };
}

function summarizeCarts(carts) {
  const activeCarts = carts.filter((cart) => cart.recovery_status === 'active' || cart.recovery_status === 'abandoned');
  const recoveredCarts = carts.filter((cart) => cart.recovery_status === 'recovered' && Boolean(cart.abandoned_at));
  const recoveredAfterEmail = recoveredCarts.filter((cart) => cart.recovery_emails_sent > 0);
  const retainedRecovered = recoveredCarts.filter((cart) => cart.recovered_revenue_state === 'retained');
  const retainedRecoveredAfterEmail = retainedRecovered.filter((cart) => cart.recovery_emails_sent > 0);
  const refundedRecovered = recoveredCarts.filter((cart) => cart.recovered_revenue_state === 'refunded');
  const unknownRecovered = recoveredCarts.filter((cart) => cart.recovered_revenue_state !== 'retained'
    && cart.recovered_revenue_state !== 'refunded');
  // Only a recorded abandonment event belongs in behavioral breakdowns.
  // Active carts and purchases completed before abandonment remain visible in
  // operational totals but must not distort "most abandoned" analytics.
  const abandonmentCohort = carts.filter((cart) => Boolean(cart.abandoned_at));

  return {
    totalCount: carts.length,
    activeCount: carts.filter((cart) => cart.recovery_status === 'active').length,
    abandonedCount: carts.filter((cart) => cart.recovery_status === 'abandoned').length,
    recoveredCount: recoveredCarts.length,
    recoveredRetainedCount: retainedRecovered.length,
    recoveredRefundedCount: refundedRecovered.length,
    recoveredRevenueUnknownCount: unknownRecovered.length,
    expiredCount: carts.filter((cart) => cart.recovery_status === 'expired').length,
    activeValueCents: activeCarts.reduce((sum, cart) => sum + cart.captured_value_cents, 0),
    recoveredValueCents: retainedRecovered.reduce((sum, cart) => sum + cart.captured_value_cents, 0),
    recoveredAfterEmailCount: recoveredAfterEmail.length,
    recoveredAfterEmailRetainedCount: retainedRecoveredAfterEmail.length,
    recoveredAfterEmailValueCents: retainedRecoveredAfterEmail.reduce((sum, cart) => sum + cart.captured_value_cents, 0),
    suppressedCount: carts.filter((cart) => Boolean(cart.recovery_suppression_reason)).length,
    withEmailCount: carts.filter((cart) => Boolean(cart.email)).length,
    abandonmentCohortCount: abandonmentCohort.length,
    topSizes: topFacets(cartFacetPresence(abandonmentCohort, (item) => item.dimensions)),
    topMaterials: topFacets(cartFacetPresence(abandonmentCohort, (item) => item.material)),
    topProducts: topFacets(cartFacetPresence(abandonmentCohort, (item) => item.product_type)),
    valueBands: topFacets(abandonmentCohort.map((cart) => ({
      label: capturedValueBand(cart.captured_value_cents),
      count: 1,
    })), 10),
    checkoutStages: topFacets(abandonmentCohort.map((cart) => ({ label: cart.checkout_stage, count: 1 })), 10),
    outcomeComparison: summarizeOutcomeComparison(carts),
  };
}

async function readSuppressionState(sql, requestedEmails = null) {
  const suppressionByEmail = new Map();
  const normalizedEmails = Array.isArray(requestedEmails)
    ? [...new Set(requestedEmails
      .map((email) => safeString(email).toLowerCase())
      .filter(Boolean))].slice(0, MAX_PAGE_SIZE)
    : null;
  const normalizedDomains = normalizedEmails
    ? [...new Set(normalizedEmails
      .filter((email) => email.includes('@'))
      .map((email) => email.slice(email.lastIndexOf('@') + 1))
      .filter(Boolean))]
    : null;
  const queryForPage = (query, emailOnly = false) => {
    if (normalizedEmails === null) return null;
    if (emailOnly) return sql(query, [normalizedEmails]);
    return sql(query, [normalizedEmails, normalizedDomains]);
  };
  const remember = (value, reason, recordedAt, scope = 'email') => {
    const normalizedScope = safeString(scope, 'email').toLowerCase();
    const isDomainScope = normalizedScope === 'email_domain' || normalizedScope === 'company_domain';
    const rawValue = safeString(value).toLowerCase();
    const normalizedValue = isDomainScope ? rawValue.replace(/^@/, '') : rawValue;
    const key = isDomainScope ? `@${normalizedValue}` : normalizedValue;
    if (!normalizedValue || suppressionByEmail.has(key)) return;
    suppressionByEmail.set(key, { reason: safeString(reason, 'suppressed') || 'suppressed', recordedAt: recordedAt || null });
  };

  if (normalizedEmails?.length === 0) return suppressionByEmail;

  try {
    const rows = normalizedEmails === null ? await sql`
      SELECT normalized_value AS value, reason, scope, updated_at AS recorded_at
        FROM outbound_suppressions
       WHERE scope IN ('email', 'email_domain', 'company_domain')
         AND active = TRUE
    ` : await queryForPage(`
      SELECT normalized_value AS value, reason, scope, updated_at AS recorded_at
        FROM outbound_suppressions
       WHERE active = TRUE
         AND (
           (scope = 'email' AND LOWER(BTRIM(normalized_value)) = ANY($1::TEXT[]))
           OR (
             scope IN ('email_domain', 'company_domain')
             AND LOWER(REGEXP_REPLACE(BTRIM(normalized_value), '^@', '')) = ANY($2::TEXT[])
           )
         )
    `);
    rows
      .filter((row) => RECOVERY_SUPPRESSION_REASONS.has(safeString(row.reason).toLowerCase()))
      .forEach((row) => remember(row.value, row.reason, row.recorded_at, row.scope));
  } catch (error) {
    console.warn('[get-abandoned-carts] outbound_suppressions unavailable:', error.message);
  }

  try {
    const rows = normalizedEmails === null ? await sql`
      SELECT normalized_email AS email, reason, updated_at AS recorded_at
        FROM recovery_email_suppressions
       WHERE active = TRUE
    ` : await queryForPage(`
      SELECT normalized_email AS email, reason, updated_at AS recorded_at
        FROM recovery_email_suppressions
       WHERE active = TRUE
         AND LOWER(BTRIM(normalized_email)) = ANY($1::TEXT[])
    `, true);
    rows.forEach((row) => remember(row.email, row.reason, row.recorded_at));
  } catch (error) {
    console.warn('[get-abandoned-carts] recovery suppressions unavailable:', error.message);
  }

  try {
    const rows = normalizedEmails === null ? await sql`
      SELECT normalized_email AS email, reason, updated_at AS recorded_at
        FROM trade_show_email_unsubscribes
    ` : await queryForPage(`
      SELECT normalized_email AS email, reason, updated_at AS recorded_at
        FROM trade_show_email_unsubscribes
       WHERE LOWER(BTRIM(normalized_email)) = ANY($1::TEXT[])
    `, true);
    rows.forEach((row) => remember(row.email, row.reason, row.recorded_at));
  } catch (error) {
    console.warn('[get-abandoned-carts] trade-show suppressions unavailable:', error.message);
  }

  try {
    const rows = normalizedEmails === null ? await sql`
      SELECT DISTINCT ON (LOWER(email))
             LOWER(email) AS email,
             consent,
             captured_at AS recorded_at
        FROM email_captures
       ORDER BY LOWER(email), captured_at DESC
    ` : await queryForPage(`
      SELECT DISTINCT ON (LOWER(BTRIM(email)))
             LOWER(BTRIM(email)) AS email,
             consent,
             captured_at AS recorded_at
        FROM email_captures
       WHERE LOWER(BTRIM(email)) = ANY($1::TEXT[])
       ORDER BY LOWER(BTRIM(email)), captured_at DESC
    `, true);
    rows.filter((row) => row.consent === false).forEach((row) => remember(row.email, 'consent_withdrawn', row.recorded_at));
  } catch (error) {
    console.warn('[get-abandoned-carts] email consent table unavailable:', error.message);
  }

  try {
    const rows = normalizedEmails === null ? await sql`
      SELECT LOWER(BTRIM(email)) AS email, updated_at AS recorded_at
        FROM newsletter
       WHERE subscribed = FALSE
    ` : await queryForPage(`
      SELECT LOWER(BTRIM(email)) AS email, updated_at AS recorded_at
        FROM newsletter
       WHERE subscribed = FALSE
         AND LOWER(BTRIM(email)) = ANY($1::TEXT[])
    `, true);
    rows.forEach((row) => remember(row.email, 'newsletter_unsubscribed', row.recorded_at));
  } catch (error) {
    console.warn('[get-abandoned-carts] newsletter suppression data unavailable:', error.message);
  }

  return suppressionByEmail;
}

const safeDate = (value) => {
  const text = safeString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : text;
};

const dollarValueToCents = (value) => {
  const parsed = numberOrNull(value);
  if (parsed === null || parsed < 0) return null;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.round(parsed * 100));
};

const parseSizeFilter = (value) => {
  const normalized = safeString(value).toLowerCase().replace(/["″']/g, '').replace(/\s+/g, '');
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0 ? { width, height } : null;
};

function parseRequestOptions(event = {}) {
  const raw = event.queryStringParameters || Object.fromEntries(new URLSearchParams(event.rawQuery || ''));
  const requestedPage = positiveInteger(raw.page, 1) || 1;
  const requestedLimit = positiveInteger(raw.limit, DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE;
  const sort = new Set(['activity_desc', 'captured_desc', 'captured_asc', 'value_desc', 'value_asc', 'quantity_desc']).has(raw.sort)
    ? raw.sort
    : 'activity_desc';
  const emailPresence = new Set(['with_email', 'without_email']).has(raw.email) ? raw.email : 'all';
  const checkoutStage = KNOWN_CHECKOUT_STAGES.has(safeString(raw.stage).toLowerCase())
    || safeString(raw.stage).toLowerCase() === 'unknown'
    ? safeString(raw.stage).toLowerCase()
    : 'all';
  const recoveryStatus = new Set(['active', 'abandoned', 'recovered', 'expired']).has(raw.status) ? raw.status : 'all';
  const filters = {
    fromDate: safeDate(raw.from),
    toDate: safeDate(raw.to),
    size: parseSizeFilter(raw.size),
    minValueCents: dollarValueToCents(raw.min_value),
    maxValueCents: dollarValueToCents(raw.max_value),
    checkoutStage,
    emailPresence,
    recoveryStatus,
  };
  return {
    summaryOnly: raw.summary === '1' || raw.summary === 'true',
    page: requestedPage,
    limit: Math.min(MAX_PAGE_SIZE, Math.max(1, requestedLimit)),
    sort,
    filters,
    hasFilters: Object.values(filters).some((value) => value !== null && value !== 'all'),
  };
}

const capturedValueSql = (alias = 'cart') => `COALESCE(${alias}.estimated_total_cents::BIGINT, ${alias}.subtotal_cents::BIGINT, ROUND(${alias}.total_value * 100)::BIGINT, 0::BIGINT)`;

const safeJsonNumericSql = (expression) => `(
  CASE
    WHEN BTRIM(COALESCE(${expression}, '')) ~ '^[0-9]+([.][0-9]+)?$'
      THEN BTRIM(${expression})::NUMERIC
    ELSE NULL
  END
)`;

function buildFilterSql(filters, alias = 'cart') {
  const clauses = [];
  const params = [];
  const add = (clause, value) => {
    params.push(value);
    clauses.push(clause.replace('?', `$${params.length}`));
  };
  if (filters.fromDate) add(`${alias}.created_at >= ?::DATE`, filters.fromDate);
  if (filters.toDate) add(`${alias}.created_at < (?::DATE + INTERVAL '1 day')`, filters.toDate);
  if (filters.minValueCents !== null) add(`${capturedValueSql(alias)} >= ?`, filters.minValueCents);
  if (filters.maxValueCents !== null) add(`${capturedValueSql(alias)} <= ?`, filters.maxValueCents);
  if (filters.checkoutStage !== 'all') add(`COALESCE(NULLIF(LOWER(BTRIM(${alias}.checkout_stage)), ''), 'unknown') = ?`, filters.checkoutStage);
  if (filters.recoveryStatus !== 'all') add(`${alias}.recovery_status = ?`, filters.recoveryStatus);
  if (filters.emailPresence === 'with_email') clauses.push(`NULLIF(BTRIM(${alias}.email), '') IS NOT NULL`);
  if (filters.emailPresence === 'without_email') clauses.push(`NULLIF(BTRIM(${alias}.email), '') IS NULL`);
  if (filters.size) {
    const itemWidth = safeJsonNumericSql("COALESCE(item.value->>'width_in', item.value->>'widthIn')");
    const itemHeight = safeJsonNumericSql("COALESCE(item.value->>'height_in', item.value->>'heightIn')");
    params.push(filters.size.width, filters.size.height);
    const widthParam = `$${params.length - 1}`;
    const heightParam = `$${params.length}`;
    clauses.push(`EXISTS (
      SELECT 1
        FROM JSONB_ARRAY_ELEMENTS(
          CASE WHEN JSONB_TYPEOF(${alias}.cart_contents) = 'array' THEN ${alias}.cart_contents ELSE '[]'::JSONB END
        ) AS item(value)
       WHERE ((${itemWidth} = ${widthParam} AND ${itemHeight} = ${heightParam})
          OR (${itemWidth} = ${heightParam} AND ${itemHeight} = ${widthParam}))
    )`);
  }
  return { clause: clauses.length ? clauses.join('\n AND ') : 'TRUE', params };
}

function analyticsQuery(whereClause) {
  const value = capturedValueSql('cart');
  const recoveredEvent = "cart.recovery_status = 'recovered' AND cart.abandoned_at IS NOT NULL";
  const recoveredOrderStatus = recoveredOrderStatusSql();
  const retainedStatuses = Array.from(RETAINED_RECOVERY_ORDER_STATUSES)
    .map((status) => `'${status}'`)
    .join(', ');
  const retainedRecovery = `${recoveredEvent}
        AND recovered_order.id IS NOT NULL
        AND ${recoveredOrderStatus} IN (${retainedStatuses})`;
  const refundedRecovery = `${recoveredEvent}
        AND recovered_order.id IS NOT NULL
        AND ${recoveredOrderStatus} = 'refunded'`;
  const unknownRecovery = `${recoveredEvent}
        AND (
          recovered_order.id IS NULL
          OR ${recoveredOrderStatus} NOT IN (${retainedStatuses}, 'refunded')
        )`;
  return `
    SELECT
      COUNT(*)::INTEGER AS total_count,
      COUNT(*) FILTER (WHERE cart.recovery_status = 'active')::INTEGER AS active_count,
      COUNT(*) FILTER (WHERE cart.recovery_status = 'abandoned')::INTEGER AS abandoned_count,
      COUNT(*) FILTER (WHERE ${recoveredEvent})::INTEGER AS recovered_count,
      COUNT(*) FILTER (WHERE ${retainedRecovery})::INTEGER AS recovered_retained_count,
      COUNT(*) FILTER (WHERE ${refundedRecovery})::INTEGER AS recovered_refunded_count,
      COUNT(*) FILTER (WHERE ${unknownRecovery})::INTEGER AS recovered_revenue_unknown_count,
      COUNT(*) FILTER (WHERE cart.recovery_status = 'expired')::INTEGER AS expired_count,
      COALESCE(SUM(${value}) FILTER (WHERE cart.recovery_status IN ('active', 'abandoned')), 0)::BIGINT AS active_value_cents,
      COALESCE(SUM(${value}) FILTER (WHERE ${retainedRecovery}), 0)::BIGINT AS recovered_value_cents,
      COUNT(*) FILTER (WHERE ${recoveredEvent} AND cart.recovery_emails_sent > 0)::INTEGER AS recovered_after_email_count,
      COUNT(*) FILTER (WHERE ${retainedRecovery} AND cart.recovery_emails_sent > 0)::INTEGER AS recovered_after_email_retained_count,
      COALESCE(SUM(${value}) FILTER (WHERE ${retainedRecovery} AND cart.recovery_emails_sent > 0), 0)::BIGINT AS recovered_after_email_value_cents,
      COUNT(*) FILTER (WHERE cart.recovery_suppressed_at IS NOT NULL OR NULLIF(BTRIM(cart.recovery_suppression_reason), '') IS NOT NULL)::INTEGER AS suppressed_count,
      COUNT(*) FILTER (WHERE NULLIF(BTRIM(cart.email), '') IS NOT NULL)::INTEGER AS with_email_count,
      COUNT(*) FILTER (WHERE cart.abandoned_at IS NOT NULL)::INTEGER AS abandonment_cohort_count
    FROM abandoned_carts AS cart
    LEFT JOIN orders AS recovered_order ON ${recoveredOrderJoinSql()}
    WHERE ${whereClause}
  `;
}

function analyticsFromRow(row = {}) {
  return {
    totalCount: positiveInteger(row.total_count),
    activeCount: positiveInteger(row.active_count),
    abandonedCount: positiveInteger(row.abandoned_count),
    recoveredCount: positiveInteger(row.recovered_count),
    recoveredRetainedCount: positiveInteger(row.recovered_retained_count),
    recoveredRefundedCount: positiveInteger(row.recovered_refunded_count),
    recoveredRevenueUnknownCount: positiveInteger(row.recovered_revenue_unknown_count),
    expiredCount: positiveInteger(row.expired_count),
    activeValueCents: positiveInteger(row.active_value_cents),
    recoveredValueCents: positiveInteger(row.recovered_value_cents),
    recoveredAfterEmailCount: positiveInteger(row.recovered_after_email_count),
    recoveredAfterEmailRetainedCount: positiveInteger(row.recovered_after_email_retained_count),
    recoveredAfterEmailValueCents: positiveInteger(row.recovered_after_email_value_cents),
    suppressedCount: positiveInteger(row.suppressed_count),
    withEmailCount: positiveInteger(row.with_email_count),
    abandonmentCohortCount: positiveInteger(row.abandonment_cohort_count),
    topSizes: [],
    topMaterials: [],
    topProducts: [],
    valueBands: [],
    checkoutStages: [],
  };
}

function facetsQuery(whereClause) {
  const rawWidth = "COALESCE(item.value->>'width_in', item.value->>'widthIn')";
  const rawHeight = "COALESCE(item.value->>'height_in', item.value->>'heightIn')";
  const width = safeJsonNumericSql(rawWidth);
  const height = safeJsonNumericSql(rawHeight);
  const value = capturedValueSql('cart');
  return `
    WITH filtered AS (
      SELECT cart.id, cart.cart_contents, cart.checkout_stage, ${value} AS captured_value_cents
        FROM abandoned_carts AS cart
       WHERE ${whereClause}
         AND cart.abandoned_at IS NOT NULL
    ), item_facets AS (
      SELECT DISTINCT filtered.id, 'size'::TEXT AS facet,
             CASE WHEN ${width} IS NULL OR ${height} IS NULL THEN 'Unknown'
                  ELSE TO_CHAR(${width}, 'FM999999990.##') || '″ × ' || TO_CHAR(${height}, 'FM999999990.##') || '″' END AS label
        FROM filtered
        CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(
          CASE WHEN JSONB_TYPEOF(filtered.cart_contents) = 'array' THEN filtered.cart_contents ELSE '[]'::JSONB END
        ) AS item(value)
      UNION ALL
      SELECT DISTINCT filtered.id, 'material'::TEXT,
             LEFT(COALESCE(NULLIF(BTRIM(item.value->>'material'), ''), 'Unknown'), 120)
        FROM filtered
        CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(
          CASE WHEN JSONB_TYPEOF(filtered.cart_contents) = 'array' THEN filtered.cart_contents ELSE '[]'::JSONB END
        ) AS item(value)
      UNION ALL
      SELECT DISTINCT filtered.id, 'product'::TEXT,
             LEFT(COALESCE(NULLIF(BTRIM(COALESCE(item.value->>'product_type', item.value->>'productType')), ''), 'banner'), 120)
        FROM filtered
        CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(
          CASE WHEN JSONB_TYPEOF(filtered.cart_contents) = 'array' THEN filtered.cart_contents ELSE '[]'::JSONB END
        ) AS item(value)
    ), cart_facets AS (
      SELECT filtered.id, 'value'::TEXT AS facet,
             CASE WHEN filtered.captured_value_cents < 5000 THEN '$0–$49'
                  WHEN filtered.captured_value_cents < 10000 THEN '$50–$99'
                  WHEN filtered.captured_value_cents < 25000 THEN '$100–$249'
                  WHEN filtered.captured_value_cents < 50000 THEN '$250–$499'
                  ELSE '$500+' END AS label
        FROM filtered
      UNION ALL
      SELECT filtered.id, 'stage'::TEXT,
             LEFT(COALESCE(NULLIF(BTRIM(filtered.checkout_stage), ''), 'unknown'), 64)
        FROM filtered
    ), counts AS (
      SELECT facet, label, COUNT(*)::INTEGER AS count
        FROM (SELECT * FROM item_facets UNION ALL SELECT * FROM cart_facets) AS all_facets
       GROUP BY facet, label
    ), ranked AS (
      SELECT counts.*, ROW_NUMBER() OVER (PARTITION BY facet ORDER BY count DESC, label ASC) AS rank
        FROM counts
    )
    SELECT facet, label, count
      FROM ranked
     WHERE (facet IN ('size', 'material', 'product') AND rank <= 5)
        OR (facet IN ('value', 'stage') AND rank <= 10)
     ORDER BY facet, rank
  `;
}

function applyFacetRows(analytics, rows = []) {
  const mapping = {
    size: 'topSizes',
    material: 'topMaterials',
    product: 'topProducts',
    value: 'valueBands',
    stage: 'checkoutStages',
  };
  rows.forEach((row) => {
    const target = mapping[row.facet];
    if (!target) return;
    analytics[target].push({ label: safeString(row.label, 'Unknown') || 'Unknown', count: positiveInteger(row.count) });
  });
  return analytics;
}

function outcomeComparisonQuery() {
  const rawArea = "COALESCE(item.value->>'area_sqft', item.value->>'areaSqFt')";
  const rawWidth = "COALESCE(item.value->>'width_in', item.value->>'widthIn')";
  const rawHeight = "COALESCE(item.value->>'height_in', item.value->>'heightIn')";
  const recordedArea = safeJsonNumericSql(rawArea);
  const width = safeJsonNumericSql(rawWidth);
  const height = safeJsonNumericSql(rawHeight);
  const itemArea = `COALESCE(${recordedArea}, (${width} * ${height}) / 144.0)`;
  const value = capturedValueSql('cart');
  return `
    WITH eligible AS (
      SELECT cart.id,
             CASE WHEN cart.abandoned_at IS NOT NULL THEN 'abandoned' ELSE 'completed' END AS outcome,
             ${value} AS captured_value_cents,
             cart.cart_contents
        FROM abandoned_carts AS cart
       WHERE cart.checkout_stage_updated_at IS NOT NULL
         AND LOWER(BTRIM(cart.checkout_stage)) IN ('cart', 'checkout', 'contact', 'payment_started')
         AND cart.recovery_status <> 'active'
         AND (cart.abandoned_at IS NOT NULL OR (cart.abandoned_at IS NULL AND cart.recovery_status = 'recovered'))
    ), classified AS (
      SELECT eligible.*,
             banner_size.largest_area
        FROM eligible
        LEFT JOIN LATERAL (
          SELECT MAX(${itemArea}) AS largest_area
            FROM JSONB_ARRAY_ELEMENTS(
              CASE WHEN JSONB_TYPEOF(eligible.cart_contents) = 'array' THEN eligible.cart_contents ELSE '[]'::JSONB END
            ) AS item(value)
           WHERE LOWER(BTRIM(COALESCE(NULLIF(item.value->>'product_type', ''), NULLIF(item.value->>'productType', ''), 'banner'))) = 'banner'
        ) AS banner_size ON TRUE
    ), outcomes AS (
      SELECT 'size'::TEXT AS dimension,
             CASE WHEN largest_area < 18 THEN 'small_medium' ELSE 'large_plus' END AS band_key,
             outcome,
             COUNT(*)::INTEGER AS count
        FROM classified
       WHERE largest_area IS NOT NULL AND largest_area > 0
       GROUP BY band_key, outcome
      UNION ALL
      SELECT 'value'::TEXT,
             CASE WHEN captured_value_cents < 5000 THEN '$0–$49'
                  WHEN captured_value_cents < 10000 THEN '$50–$99'
                  WHEN captured_value_cents < 25000 THEN '$100–$249'
                  WHEN captured_value_cents < 50000 THEN '$250–$499'
                  ELSE '$500+' END,
             outcome,
             COUNT(*)::INTEGER
        FROM classified
       GROUP BY 2, outcome
    )
    SELECT dimension, band_key, outcome, count
      FROM outcomes
     ORDER BY dimension, band_key, outcome
  `;
}

function comparisonFromRows(rows = []) {
  const sizeCounts = new Map();
  const valueCounts = new Map();
  rows.forEach((row) => {
    const target = row.dimension === 'size' ? sizeCounts : row.dimension === 'value' ? valueCounts : null;
    if (!target || !['abandoned', 'completed'].includes(row.outcome)) return;
    const current = target.get(row.band_key) || { abandoned: 0, completed: 0 };
    current[row.outcome] = positiveInteger(row.count);
    target.set(row.band_key, current);
  });
  const sizeBands = SIZE_OUTCOME_BANDS.map((band) => outcomeBand(band.key, band.label, sizeCounts));
  const valueBands = VALUE_OUTCOME_BANDS.map((band) => outcomeBand(band.key, band.label, valueCounts));
  return {
    terminalSampleSize: valueBands.reduce((sum, band) => sum + band.sampleSize, 0),
    minimumSampleSize: OUTCOME_MINIMUM_SAMPLE_SIZE,
    minimumOutcomeCount: OUTCOME_MINIMUM_PER_OUTCOME,
    sizeClassifiedSampleSize: sizeBands.reduce((sum, band) => sum + band.sampleSize, 0),
    valueClassifiedSampleSize: valueBands.reduce((sum, band) => sum + band.sampleSize, 0),
    sizeBands,
    valueBands,
  };
}

const sortSql = (sort) => ({
  captured_desc: 'cart.created_at DESC, cart.id DESC',
  captured_asc: 'cart.created_at ASC, cart.id ASC',
  value_desc: `${capturedValueSql('cart')} DESC, cart.last_activity_at DESC, cart.id DESC`,
  value_asc: `${capturedValueSql('cart')} ASC, cart.last_activity_at DESC, cart.id DESC`,
  quantity_desc: 'item_quantity DESC, cart.last_activity_at DESC, cart.id DESC',
  activity_desc: 'cart.last_activity_at DESC, cart.created_at DESC, cart.id DESC',
}[sort] || 'cart.last_activity_at DESC, cart.created_at DESC, cart.id DESC');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const admin = requireAdmin(event);
  if (!admin.ok) return { ...admin.response, headers: { ...headers, ...admin.response.headers } };

  try {
    const databaseUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || process.env.VITE_DATABASE_URL;
    if (!databaseUrl) {
      console.error('[get-abandoned-carts] No database URL found');
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Database configuration error' }) };
    }

    const sql = neon(databaseUrl);
    await ensureAbandonedCartSchema(sql);

    const options = parseRequestOptions(event);
    const allAnalyticsRows = await sql(analyticsQuery('TRUE'));
    const analytics = analyticsFromRow(allAnalyticsRows[0]);

    if (options.summaryOnly) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ carts: [], analytics, summaryOnly: true }),
      };
    }

    const filtered = buildFilterSql(options.filters);
    const filteredAnalyticsPromise = options.hasFilters
      ? sql(analyticsQuery(filtered.clause), filtered.params)
      : Promise.resolve(allAnalyticsRows);
    const facetsPromise = sql(facetsQuery(filtered.clause), filtered.params);
    const comparisonPromise = sql(outcomeComparisonQuery());
    const listParams = [...filtered.params, options.limit, (options.page - 1) * options.limit];
    const limitParam = `$${listParams.length - 1}`;
    const offsetParam = `$${listParams.length}`;
    const rawQuantity = "COALESCE(item.value->>'quantity', '1')";
    const quantity = safeJsonNumericSql(rawQuantity);

    // A page and per-cart item cap make the buffered Netlify response
    // structurally bounded. Exact counts and facets are computed separately in
    // SQL over the full filtered cohort, so pagination never fabricates or
    // truncates analytics.
    const listPromise = sql(`
      SELECT
        cart.id,
        cart.user_id,
        LEFT(cart.session_id, 160) AS session_id,
        LEFT(cart.customer_first_name, 120) AS customer_first_name,
        LEFT(cart.customer_last_name, 120) AS customer_last_name,
        LEFT(cart.email, 320) AS email,
        LEFT(cart.phone, 64) AS phone,
        cart.total_value,
        LEFT(cart.currency, 8) AS currency,
        cart.subtotal_cents,
        cart.discount_cents,
        cart.tax_cents,
        cart.estimated_total_cents,
        LEFT(cart.checkout_stage, 64) AS checkout_stage,
        cart.checkout_stage_updated_at,
        cart.has_artwork,
        LEFT(cart.recovery_status, 64) AS recovery_status,
        cart.recovery_emails_sent,
        LEFT(cart.discount_code, 120) AS discount_code,
        cart.last_recovery_email_at,
        cart.recovery_suppressed_at,
        LEFT(cart.recovery_suppression_reason, 120) AS recovery_suppression_reason,
        LEFT(cart.recovery_email_last_error, 400) AS recovery_email_last_error,
        cart.last_activity_at,
        cart.abandoned_at,
        cart.recovered_at,
        LEFT(cart.recovered_order_id::TEXT, 160) AS recovered_order_id,
        recovered_order.id IS NOT NULL AS recovered_order_found,
        LEFT(${recoveredOrderStatusSql()}, 80) AS recovered_order_status,
        cart.created_at,
        JSONB_ARRAY_LENGTH(CASE WHEN JSONB_TYPEOF(cart.cart_contents) = 'array' THEN cart.cart_contents ELSE '[]'::JSONB END)::INTEGER AS stored_item_count,
        CASE
          WHEN JSONB_TYPEOF(cart.cart_contents) = 'array'
            AND JSONB_TYPEOF(cart.cart_contents->0) = 'object'
            AND cart.cart_contents->0 ? '${SNAPSHOT_METADATA_KEY}'
          THEN TRUE
          ELSE FALSE
        END AS snapshot_metadata_present,
        LEFT(cart.cart_contents->0->'${SNAPSHOT_METADATA_KEY}'->>'version', 16) AS snapshot_metadata_version,
        LEFT(cart.cart_contents->0->'${SNAPSHOT_METADATA_KEY}'->>'sourceItemCount', 32) AS snapshot_source_item_count,
        LEFT(cart.cart_contents->0->'${SNAPSHOT_METADATA_KEY}'->>'storedItemCount', 32) AS snapshot_stored_item_count,
        LEFT(cart.cart_contents->0->'${SNAPSHOT_METADATA_KEY}'->>'complete', 8) AS snapshot_complete,
        COALESCE((
          SELECT SUM(LEAST(1000000, GREATEST(1, ROUND(COALESCE(${quantity}, 1)))))::BIGINT
            FROM JSONB_ARRAY_ELEMENTS(
              CASE WHEN JSONB_TYPEOF(cart.cart_contents) = 'array' THEN cart.cart_contents ELSE '[]'::JSONB END
            ) AS item(value)
        ), 0)::BIGINT AS item_quantity,
        JSONB_ARRAY_LENGTH(CASE WHEN JSONB_TYPEOF(cart.cart_contents) = 'array' THEN cart.cart_contents ELSE '[]'::JSONB END) > ${MAX_ITEM_SUMMARIES} AS item_summaries_truncated,
        COALESCE((
          SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
            'product_type', LEFT(COALESCE(NULLIF(item.value->>'product_type', ''), NULLIF(item.value->>'productType', ''), 'banner'), 120),
            'width_in', LEFT(COALESCE(item.value->>'width_in', item.value->>'widthIn'), 32),
            'height_in', LEFT(COALESCE(item.value->>'height_in', item.value->>'heightIn'), 32),
            'area_sqft', LEFT(COALESCE(item.value->>'area_sqft', item.value->>'areaSqFt'), 32),
            'material', LEFT(COALESCE(NULLIF(item.value->>'material', ''), 'Unknown'), 120),
            'quantity', LEFT(COALESCE(item.value->>'quantity', '1'), 32),
            'line_total_cents', LEFT(COALESCE(item.value->>'line_total_cents', item.value->>'lineTotalCents'), 32),
            'has_artwork', CASE
              WHEN NULLIF(item.value->>'file_key', '') IS NOT NULL
                OR NULLIF(item.value->>'file_url', '') IS NOT NULL
                OR NULLIF(item.value->>'thumbnail_url', '') IS NOT NULL
                OR NULLIF(item.value->>'web_preview_url', '') IS NOT NULL
                OR NULLIF(item.value->>'final_render_url', '') IS NOT NULL
                OR NULLIF(item.value->>'final_render_file_key', '') IS NOT NULL
                OR NULLIF(item.value->>'print_ready_url', '') IS NOT NULL
                OR NULLIF(item.value->>'artwork_manifest', '') IS NOT NULL
                OR NULLIF(item.value->>'placement_preview', '') IS NOT NULL
                OR JSONB_ARRAY_LENGTH(CASE WHEN JSONB_TYPEOF(item.value->'yard_sign_designs') = 'array' THEN item.value->'yard_sign_designs' ELSE '[]'::JSONB END) > 0
                OR JSONB_ARRAY_LENGTH(CASE WHEN JSONB_TYPEOF(item.value->'design_uploaded_assets') = 'array' THEN item.value->'design_uploaded_assets' ELSE '[]'::JSONB END) > 0
                OR JSONB_ARRAY_LENGTH(CASE WHEN JSONB_TYPEOF(item.value->'overlay_images') = 'array' THEN item.value->'overlay_images' ELSE '[]'::JSONB END) > 0
                OR NULLIF(item.value->'overlay_image'->>'fileKey', '') IS NOT NULL
              THEN TRUE
              WHEN LOWER(NULLIF(item.value->>'has_artwork', '')) = 'true' THEN TRUE
              WHEN LOWER(NULLIF(item.value->>'has_artwork', '')) = 'false' THEN FALSE
              ELSE NULL
            END
          ) ORDER BY item.ordinality)
          FROM JSONB_ARRAY_ELEMENTS(
            CASE WHEN JSONB_TYPEOF(cart.cart_contents) = 'array' THEN cart.cart_contents ELSE '[]'::JSONB END
          ) WITH ORDINALITY AS item(value, ordinality)
          WHERE item.ordinality <= ${MAX_ITEM_SUMMARIES}
        ), '[]'::JSONB) AS item_summaries,
        CASE
          WHEN LENGTH(COALESCE(
            cart.cart_contents->0->>'thumbnail_url',
            cart.cart_contents->0->>'web_preview_url',
            cart.cart_contents->0->>'print_ready_url',
            cart.cart_contents->0->'overlay_image'->>'fileKey',
            cart.cart_contents->0->>'file_key'
          )) <= 2048
          THEN COALESCE(
            cart.cart_contents->0->>'thumbnail_url',
            cart.cart_contents->0->>'web_preview_url',
            cart.cart_contents->0->>'print_ready_url',
            cart.cart_contents->0->'overlay_image'->>'fileKey',
            cart.cart_contents->0->>'file_key'
          )
          ELSE NULL
        END AS first_item_thumbnail
      FROM abandoned_carts AS cart
      LEFT JOIN orders AS recovered_order ON ${recoveredOrderJoinSql()}
      WHERE ${filtered.clause}
      ORDER BY ${sortSql(options.sort)}
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `, listParams);

    const [filteredAnalyticsRows, facetRows, comparisonRows, rows] = await Promise.all([
      filteredAnalyticsPromise,
      facetsPromise,
      comparisonPromise,
      listPromise,
    ]);
    const filteredAnalytics = applyFacetRows(analyticsFromRow(filteredAnalyticsRows[0]), facetRows);
    const outcomeComparison = comparisonFromRows(comparisonRows);
    analytics.outcomeComparison = outcomeComparison;
    filteredAnalytics.outcomeComparison = outcomeComparison;

    const suppressionByEmail = await readSuppressionState(sql, rows.map((row) => row.email));
    const carts = rows.map((row) => normalizeCart(row, suppressionByEmail));
    const totalItems = filteredAnalytics.totalCount;
    const totalPages = Math.max(1, Math.ceil(totalItems / options.limit));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        carts,
        analytics,
        filteredAnalytics,
        outcomeComparison,
        pagination: {
          page: options.page,
          pageSize: options.limit,
          totalItems,
          totalPages,
          hasPrevious: options.page > 1,
          hasNext: options.page < totalPages,
        },
      }),
    };
  } catch (error) {
    console.error('[get-abandoned-carts] Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch abandoned carts' }),
    };
  }
};

exports._test = {
  normalizeItem,
  normalizeSnapshotCoverage,
  normalizeCart,
  readSuppressionState,
  summarizeCarts,
  summarizeOutcomeComparison,
  comparisonFromRows,
  parseRequestOptions,
  buildFilterSql,
  analyticsQuery,
  analyticsFromRow,
  recoveredOrderJoinSql,
  recoveredRevenueState,
};
