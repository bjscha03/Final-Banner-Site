'use strict';

const COMPLETED_STATUSES = new Set(['paid', 'in_production', 'shipped', 'delivered', 'fulfilled']);
const SETTLED_IDENTITY_STATUSES = new Set([...COMPLETED_STATUSES, 'refunded']);
const CUSTOMER_SEGMENTS = new Set(['all', 'first_time', 'repeat', 'lapsed']);
const ORDER_PERIODS = new Set(['all_time', 'this_month', 'last_month', 'custom']);
const LAPSED_DAY_OPTIONS = new Set([90, 180, 365]);
const CUSTOMER_PAGE_SIZE_OPTIONS = new Set([25, 50, 100]);
const DEFAULT_CUSTOMER_PAGE_SIZE = 50;
const MAX_EXPORT_PAGE_SIZE = 250;
const MAX_DETAIL_PAGE_SIZE = 100;
const OUTBOUND_SUPPRESSION_REASONS = new Set([
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

const SYNTHETIC_LOCAL_PARTS = new Set([
  'customer',
  'guest',
  'guestcustomer',
  'noemail',
  'none',
  'noreply',
  'preview',
  'test',
  'unknown',
]);

const SYNTHETIC_DOMAINS = new Set([
  'example.com',
  'example.net',
  'example.org',
  'example.test',
  'invalid',
  'localhost',
  'test.com',
]);

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveCustomerEmail(row) {
  const orderEmail = normalizeEmail(row?.order_email ?? row?.email);
  const profileEmail = normalizeEmail(row?.profile_email);
  if (isValidCustomerEmail(orderEmail)) return orderEmail;
  if (isValidCustomerEmail(profileEmail)) return profileEmail;
  return orderEmail || profileEmail;
}

function isValidCustomerEmail(value) {
  const email = normalizeEmail(value);
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;

  const splitAt = email.lastIndexOf('@');
  const local = email.slice(0, splitAt);
  const domain = email.slice(splitAt + 1);
  if (SYNTHETIC_LOCAL_PARTS.has(local) || SYNTHETIC_DOMAINS.has(domain)) return false;
  if (domain.endsWith('.invalid') || domain.endsWith('.local') || domain.endsWith('.test')) return false;
  if (/^(guest|preview|test)[-_+]/.test(local) && domain === 'bannersonthefly.com') return false;
  return true;
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveEffectiveOrderStatus(row) {
  const rawStatus = normalizeStatus(row?.status);
  if (rawStatus !== 'pending') return rawStatus;
  const captureId = String(row?.paypal_capture_id || '').trim();
  const paymentMethod = normalizeStatus(row?.payment_method);
  const reconciliationStatus = normalizeStatus(row?.payment_reconciliation_status ?? row?.reconciliation_status);
  return captureId || (paymentMethod === 'paypal' && reconciliationStatus === 'complete')
    ? 'paid'
    : rawStatus;
}

function isTestOrder(row) {
  return row?.is_test_order === true || String(row?.is_test_order || '').toLowerCase() === 'true';
}

function parseDate(value) {
  const parsed = value ? new Date(value) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed : null;
}

function parseDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    parsed.getUTCFullYear() !== Number(match[1])
    || parsed.getUTCMonth() !== Number(match[2]) - 1
    || parsed.getUTCDate() !== Number(match[3])
  ) return null;
  return parsed;
}

function resolvePeriodRange(period, startDate, endDate, now = new Date()) {
  const normalizedPeriod = ORDER_PERIODS.has(period) ? period : 'all_time';
  if (normalizedPeriod === 'all_time') return { period: normalizedPeriod, start: null, endExclusive: null };

  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  if (normalizedPeriod === 'this_month') {
    return {
      period: normalizedPeriod,
      start: new Date(Date.UTC(year, month, 1)),
      endExclusive: new Date(Date.UTC(year, month + 1, 1)),
    };
  }
  if (normalizedPeriod === 'last_month') {
    return {
      period: normalizedPeriod,
      start: new Date(Date.UTC(year, month - 1, 1)),
      endExclusive: new Date(Date.UTC(year, month, 1)),
    };
  }

  const start = parseDateOnly(startDate);
  const inclusiveEnd = parseDateOnly(endDate);
  if (!start || !inclusiveEnd || inclusiveEnd < start) {
    const error = new Error('Custom periods require valid start and end dates, with end on or after start.');
    error.code = 'INVALID_PERIOD';
    throw error;
  }
  const endExclusive = new Date(inclusiveEnd);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return { period: normalizedPeriod, start, endExclusive };
}

function isWithinRange(value, range) {
  if (!range.start || !range.endExclusive) return true;
  const date = parseDate(value);
  return Boolean(date && date >= range.start && date < range.endExclusive);
}

function splitCustomerName(fullName, explicitFirstName) {
  const name = String(fullName || '').trim().replace(/\s+/g, ' ').slice(0, 500).trim();
  const invalidName = !name || /^(guest|guest customer|customer)$/i.test(name);
  const safeName = invalidName ? '' : name;
  const parts = safeName ? safeName.split(' ') : [];
  const explicitFirst = String(explicitFirstName || '').trim().slice(0, 160);
  const firstName = explicitFirst || parts[0] || '';
  let lastName = '';
  if (parts.length > 1) {
    if (explicitFirst && safeName.toLowerCase().startsWith(`${explicitFirst.toLowerCase()} `)) {
      lastName = safeName.slice(explicitFirst.length).trim();
    } else {
      lastName = parts.slice(1).join(' ');
    }
  }
  return { fullName: safeName, firstName, lastName };
}

function createSuppressionIndex() {
  return new Map();
}

function addSuppression(index, value, reason, scope = 'email') {
  const normalizedScope = String(scope || 'email').trim().toLowerCase();
  const email = normalizeEmail(value);
  const isDomainScope = normalizedScope === 'email_domain' || normalizedScope === 'company_domain';
  const key = isDomainScope
    ? `@${email.replace(/^@/, '')}`
    : email;
  if (isDomainScope ? !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(key.slice(1)) : !isValidCustomerEmail(email)) return;
  const normalizedReason = String(reason || 'suppressed').trim().toLowerCase().slice(0, 80);
  const reasons = index.get(key) || new Set();
  reasons.add(normalizedReason);
  index.set(key, reasons);
}

async function readSuppressionSource(name, query, index, unavailableSources, options = {}) {
  try {
    const rows = await query();
    for (const row of rows || []) addSuppression(index, row.email, row.reason, row.scope);
  } catch (error) {
    if (options.optionalWhenMissing && ['42P01', '42703'].includes(String(error?.code || ''))) {
      return;
    }
    unavailableSources.push(name);
    console.warn(`[admin-customers] ${name} suppression data unavailable`, {
      code: error?.code || null,
      message: error?.message || String(error),
    });
  }
}

function normalizeSuppressionCandidates(values, maximum = 250) {
  if (!Array.isArray(values) || values.length === 0) return [];
  if (values.length > maximum) {
    const error = new Error('Suppression verification batch is too large.');
    error.code = 'SUPPRESSION_BATCH_TOO_LARGE';
    throw error;
  }
  const emails = Array.from(new Set(values.map(normalizeEmail)));
  if (emails.some((email) => !isValidCustomerEmail(email))) {
    const error = new Error('Suppression verification contains an invalid email.');
    error.code = 'INVALID_SUPPRESSION_EMAIL';
    throw error;
  }
  return emails;
}

/**
 * Resolve suppression state for a bounded set of response/export candidates.
 * Aggregate list counts use indexed EXISTS checks in Postgres; this helper is
 * intentionally limited to detail and final-export verification so a Lambda
 * never materializes every suppression record in memory.
 */
async function loadSuppressionIndex(sql, candidateValues) {
  const emails = normalizeSuppressionCandidates(candidateValues);
  const index = createSuppressionIndex();
  const unavailableSources = [];
  if (emails.length === 0) return { index, complete: true, unavailableSources };
  const domains = Array.from(new Set(emails.map((email) => email.slice(email.lastIndexOf('@') + 1))));

  await readSuppressionSource('recovery_email_suppressions', () => sql(
    `SELECT normalized_email AS email, LEFT(LOWER(reason), 80) AS reason, 'email' AS scope
       FROM recovery_email_suppressions
      WHERE active = TRUE
        AND normalized_email = ANY($1::text[])`,
    [emails],
  ), index, unavailableSources);

  await readSuppressionSource('outbound_suppressions', () => sql(
    `SELECT normalized_value AS email, LEFT(LOWER(reason), 80) AS reason, LOWER(scope) AS scope
       FROM outbound_suppressions
      WHERE active = TRUE
        AND LOWER(scope) IN ('email', 'email_domain', 'company_domain')
        AND LOWER(reason) = ANY($1::text[])
        AND (
          (LOWER(scope) = 'email' AND normalized_value = ANY($2::text[]))
          OR (LOWER(scope) IN ('email_domain', 'company_domain') AND normalized_value = ANY($3::text[]))
        )`,
    [Array.from(OUTBOUND_SUPPRESSION_REASONS), emails, domains],
  ), index, unavailableSources);

  await readSuppressionSource('trade_show_email_unsubscribes', () => sql(
    `SELECT normalized_email AS email, LEFT(LOWER(reason), 80) AS reason
       FROM trade_show_email_unsubscribes
      WHERE normalized_email = ANY($1::text[])`,
    [emails],
  ), index, unavailableSources);

  await readSuppressionSource('email_captures', () => sql(
    `SELECT latest.email, 'consent_false' AS reason, 'email' AS scope
       FROM (
         SELECT DISTINCT ON (LOWER(TRIM(email)))
                LOWER(TRIM(email)) AS email,
                consent
           FROM email_captures
          WHERE LOWER(TRIM(email)) = ANY($1::text[])
          ORDER BY LOWER(TRIM(email)), captured_at DESC, created_at DESC
       ) latest
      WHERE latest.consent = FALSE`,
    [emails],
  ), index, unavailableSources);

  // Newsletter predates the formal suppression schema and may not exist on
  // every deployment. Honor explicit opt-outs when present without treating
  // an absent legacy table as a verification outage.
  await readSuppressionSource('newsletter', () => sql(
    `SELECT LOWER(TRIM(email)) AS email, 'newsletter_unsubscribed' AS reason, 'email' AS scope
       FROM newsletter
      WHERE subscribed = FALSE
        AND LOWER(TRIM(email)) = ANY($1::text[])`,
    [emails],
  ), index, unavailableSources, { optionalWhenMissing: true });

  return {
    index,
    complete: unavailableSources.length === 0,
    unavailableSources,
  };
}

async function probeSuppressionSources(sql) {
  const unavailableSources = [];
  let includeNewsletter = true;
  const probes = [
    ['recovery_email_suppressions', `SELECT normalized_email, reason, active FROM recovery_email_suppressions LIMIT 0`, false],
    ['outbound_suppressions', `SELECT normalized_value, reason, scope, active FROM outbound_suppressions LIMIT 0`, false],
    ['trade_show_email_unsubscribes', `SELECT normalized_email, reason FROM trade_show_email_unsubscribes LIMIT 0`, false],
    ['email_captures', `SELECT email, consent, captured_at, created_at FROM email_captures LIMIT 0`, false],
    ['newsletter', `SELECT email, subscribed FROM newsletter LIMIT 0`, true],
  ];

  for (const [name, query, optionalWhenMissing] of probes) {
    try {
      await sql(query);
    } catch (error) {
      const missing = ['42P01', '42703'].includes(String(error?.code || ''));
      if (name === 'newsletter' && optionalWhenMissing && missing) {
        includeNewsletter = false;
        continue;
      }
      unavailableSources.push(name);
      console.warn(`[admin-customers] ${name} suppression schema unavailable`, {
        code: error?.code || null,
      });
    }
  }

  return {
    complete: unavailableSources.length === 0,
    includeNewsletter,
    unavailableSources,
  };
}

function customerMatchesSearch(customer, search) {
  if (!search) return true;
  const haystack = [
    customer.email,
    customer.fullName,
    customer.firstName,
    customer.lastName,
    ...customer.orders.map((order) => order.orderNumber),
  ].join(' ').toLowerCase();
  return haystack.includes(search);
}

function aggregateCustomers(rows, suppressionState = {}, options = {}, now = new Date()) {
  const lapsedDays = LAPSED_DAY_OPTIONS.has(Number(options.lapsedDays)) ? Number(options.lapsedDays) : 180;
  const segment = CUSTOMER_SEGMENTS.has(options.segment) ? options.segment : 'all';
  const search = String(options.search || '').trim().toLowerCase().slice(0, 160);
  const range = resolvePeriodRange(options.period, options.startDate, options.endDate, now);
  const suppressionIndex = suppressionState.index instanceof Map ? suppressionState.index : new Map();
  const suppressionComplete = suppressionState.complete !== false;
  const lapsedBefore = new Date(now.getTime() - lapsedDays * 24 * 60 * 60 * 1000);
  const groups = new Map();

  for (const row of rows || []) {
    const email = resolveCustomerEmail(row);
    if (isTestOrder(row) || !isValidCustomerEmail(email)) continue;
    const createdAt = parseDate(row.created_at)?.toISOString() || null;
    const totalCents = Math.max(0, Number.isFinite(Number(row.total_cents)) ? Math.round(Number(row.total_cents)) : 0);
    const status = resolveEffectiveOrderStatus(row);
    const current = groups.get(email) || {
      email,
      fullName: '',
      firstName: '',
      lastName: '',
      nameUpdatedAt: null,
      orders: [],
    };

    // Treat names as customer identity only after a settled order. A caller can
    // create a pending checkout for an address they know, so allowing unpaid
    // attempts to win this timestamp race would poison the Admin UI and CSV.
    if (SETTLED_IDENTITY_STATUSES.has(status)) {
      const candidateName = splitCustomerName(
        row.customer_name || row.shipping_name || row.profile_full_name,
        row.customer_first_name,
      );
      const nameDate = parseDate(createdAt);
      const existingNameDate = parseDate(current.nameUpdatedAt);
      if (candidateName.fullName && (!existingNameDate || (nameDate && nameDate >= existingNameDate))) {
        current.fullName = candidateName.fullName;
        current.firstName = candidateName.firstName;
        current.lastName = candidateName.lastName;
        current.nameUpdatedAt = createdAt;
      }
    }

    current.orders.push({
      id: String(row.id || ''),
      orderNumber: String(row.order_number || row.id || '').slice(0, 160),
      createdAt,
      status: status || 'unknown',
      totalCents,
      completed: COMPLETED_STATUSES.has(status),
    });
    groups.set(email, current);
  }

  let periodPopulation = [];
  for (const group of groups.values()) {
    group.orders.sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
    const completedOrders = group.orders.filter((order) => order.completed);
    const hasSettledCustomerOrder = group.orders.some((order) => order.completed || order.status === 'refunded');
    // A pending/failed checkout alone is not a customer. Once an address has
    // settled order history, keep its other non-test attempts in the detail view.
    if (!hasSettledCustomerOrder) continue;
    const periodOrders = completedOrders.filter((order) => isWithinRange(order.createdAt, range));
    if (range.start && periodOrders.length === 0) continue;

    const firstOrder = completedOrders.at(-1) || null;
    const lastOrder = completedOrders[0] || null;
    const completedOrderCount = completedOrders.length;
    const lifetimeRevenueCents = completedOrders.reduce((sum, order) => sum + order.totalCents, 0);
    const periodRevenueCents = periodOrders.reduce((sum, order) => sum + order.totalCents, 0);
    const isLapsed = Boolean(lastOrder?.createdAt && parseDate(lastOrder.createdAt) < lapsedBefore);
    const baseSegment = completedOrderCount >= 2
      ? 'repeat'
      : completedOrderCount === 1
        ? 'first_time'
        : 'no_completed_order';
    const domain = group.email.slice(group.email.lastIndexOf('@') + 1);
    const suppressionReasons = Array.from(new Set([
      ...(suppressionIndex.get(group.email) || []),
      ...(suppressionIndex.get(`@${domain}`) || []),
    ])).sort();
    if (!suppressionComplete) suppressionReasons.push('suppression_data_unavailable');

    periodPopulation.push({
      email: group.email,
      fullName: group.fullName,
      firstName: group.firstName,
      lastName: group.lastName,
      completedOrderCount,
      lifetimeRevenueCents,
      firstOrderAt: firstOrder?.createdAt || null,
      lastOrderAt: lastOrder?.createdAt || null,
      periodOrderCount: periodOrders.length,
      periodRevenueCents,
      segment: baseSegment,
      isLapsed,
      marketingEligible: suppressionReasons.length === 0,
      suppressionReason: suppressionReasons.join(', '),
      suppressionReasons,
      orders: group.orders,
    });
  }

  periodPopulation = periodPopulation.filter((customer) => customerMatchesSearch(customer, search));
  periodPopulation.sort((left, right) => (
    String(right.lastOrderAt || right.orders[0]?.createdAt || '')
      .localeCompare(String(left.lastOrderAt || left.orders[0]?.createdAt || ''))
      || left.email.localeCompare(right.email)
  ));

  const stats = periodPopulation.reduce((summary, customer) => {
    summary.all += 1;
    if (customer.segment === 'first_time') summary.firstTime += 1;
    if (customer.segment === 'repeat') summary.repeat += 1;
    if (customer.isLapsed) summary.lapsed += 1;
    if (customer.marketingEligible) summary.marketingEligible += 1;
    else summary.marketingExcluded += 1;
    summary.lifetimeRevenueCents += customer.lifetimeRevenueCents;
    summary.periodRevenueCents += customer.periodRevenueCents;
    return summary;
  }, {
    all: 0,
    firstTime: 0,
    repeat: 0,
    lapsed: 0,
    marketingEligible: 0,
    marketingExcluded: 0,
    lifetimeRevenueCents: 0,
    periodRevenueCents: 0,
  });

  const customers = periodPopulation.filter((customer) => {
    if (segment === 'first_time') return customer.segment === 'first_time';
    if (segment === 'repeat') return customer.segment === 'repeat';
    if (segment === 'lapsed') return customer.isLapsed;
    return true;
  });

  const filteredSummary = customers.reduce((summary, customer) => {
    summary.total += 1;
    summary.lifetimeRevenueCents += customer.lifetimeRevenueCents;
    summary.periodRevenueCents += customer.periodRevenueCents;
    if (customer.marketingEligible) summary.marketingEligible += 1;
    else summary.marketingExcluded += 1;
    return summary;
  }, createFilteredSummary());

  return {
    customers,
    stats,
    filteredSummary,
    exportSummary: {
      eligible: customers.filter((customer) => customer.marketingEligible).length,
      excluded: customers.filter((customer) => !customer.marketingEligible).length,
      suppressionDataComplete: suppressionComplete,
      unavailableSources: suppressionState.unavailableSources || [],
    },
    filters: {
      segment,
      period: range.period,
      lapsedDays,
      start: range.start?.toISOString() || null,
      endExclusive: range.endExclusive?.toISOString() || null,
      search,
    },
  };
}

function createCustomerStats() {
  return {
    all: 0,
    firstTime: 0,
    repeat: 0,
    lapsed: 0,
    marketingEligible: 0,
    marketingExcluded: 0,
    lifetimeRevenueCents: 0,
    periodRevenueCents: 0,
  };
}

function createFilteredSummary() {
  return {
    total: 0,
    marketingEligible: 0,
    marketingExcluded: 0,
    lifetimeRevenueCents: 0,
    periodRevenueCents: 0,
  };
}

function positiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function resolveListPagination(page, pageSize) {
  const normalizedPageSize = CUSTOMER_PAGE_SIZE_OPTIONS.has(Number(pageSize))
    ? Number(pageSize)
    : DEFAULT_CUSTOMER_PAGE_SIZE;
  const normalizedPage = positiveInteger(page, 1, 100_000);
  return {
    page: normalizedPage,
    pageSize: normalizedPageSize,
    offset: (normalizedPage - 1) * normalizedPageSize,
  };
}

function resolveExportPageSize(value) {
  return positiveInteger(value, 200, MAX_EXPORT_PAGE_SIZE);
}

function resolveDetailPagination(page, pageSize) {
  const normalizedPageSize = positiveInteger(pageSize, 50, MAX_DETAIL_PAGE_SIZE);
  const normalizedPage = positiveInteger(page, 1, 100_000);
  return {
    page: normalizedPage,
    pageSize: normalizedPageSize,
    offset: (normalizedPage - 1) * normalizedPageSize,
  };
}

function suppressionReasonsForEmail(suppressionState, value) {
  const email = normalizeEmail(value);
  const index = suppressionState?.index instanceof Map ? suppressionState.index : new Map();
  const domain = email.includes('@') ? email.slice(email.lastIndexOf('@') + 1) : '';
  const reasons = new Set([
    ...(index.get(email) || []),
    ...(domain ? index.get(`@${domain}`) || [] : []),
  ]);
  if (suppressionState?.complete === false) reasons.add('suppression_data_unavailable');
  return Array.from(reasons).sort();
}

function customerMatchesSegment(customer, segment) {
  if (segment === 'first_time') return customer.segment === 'first_time';
  if (segment === 'repeat') return customer.segment === 'repeat';
  if (segment === 'lapsed') return customer.isLapsed;
  return true;
}

function customerFromSummaryRow(row, suppressionState = {}) {
  const email = normalizeEmail(row?.email);
  if (!isValidCustomerEmail(email)) return null;
  const names = splitCustomerName(row?.customer_name, row?.customer_first_name);
  const completedOrderCount = Math.max(0, Math.round(Number(row?.completed_order_count) || 0));
  const lifetimeRevenueCents = Math.max(0, Math.round(Number(row?.lifetime_revenue_cents) || 0));
  const periodOrderCount = Math.max(0, Math.round(Number(row?.period_order_count) || 0));
  const periodRevenueCents = Math.max(0, Math.round(Number(row?.period_revenue_cents) || 0));
  const hasTargetedIndex = suppressionState?.index instanceof Map;
  const suppressionReasons = hasTargetedIndex
    ? suppressionReasonsForEmail(suppressionState, email)
    : ((row?.marketing_eligible === true || String(row?.marketing_eligible || '').toLowerCase() === 'true')
      ? []
      : ['suppressed']);
  const segment = completedOrderCount >= 2
    ? 'repeat'
    : completedOrderCount === 1
      ? 'first_time'
      : 'no_completed_order';
  return {
    email,
    fullName: names.fullName,
    firstName: names.firstName,
    lastName: names.lastName,
    completedOrderCount,
    lifetimeRevenueCents,
    firstOrderAt: parseDate(row?.first_order_at)?.toISOString() || null,
    lastOrderAt: parseDate(row?.last_order_at)?.toISOString() || null,
    periodOrderCount,
    periodRevenueCents,
    segment,
    isLapsed: row?.is_lapsed === true || String(row?.is_lapsed || '').toLowerCase() === 'true',
    marketingEligible: suppressionReasons.length === 0,
    suppressionReason: suppressionReasons.join(', '),
    suppressionReasons,
  };
}

function statsFromRow(row = {}) {
  return {
    all: Math.max(0, Number(row.all_count) || 0),
    firstTime: Math.max(0, Number(row.first_time_count) || 0),
    repeat: Math.max(0, Number(row.repeat_count) || 0),
    lapsed: Math.max(0, Number(row.lapsed_count) || 0),
    marketingEligible: Math.max(0, Number(row.marketing_eligible_count) || 0),
    marketingExcluded: Math.max(0, Number(row.marketing_excluded_count) || 0),
    lifetimeRevenueCents: Math.max(0, Number(row.lifetime_revenue_cents) || 0),
    periodRevenueCents: Math.max(0, Number(row.period_revenue_cents) || 0),
  };
}

function filteredSummaryFromRow(row = {}) {
  return {
    total: Math.max(0, Number(row.filtered_count) || 0),
    marketingEligible: Math.max(0, Number(row.filtered_marketing_eligible_count) || 0),
    marketingExcluded: Math.max(0, Number(row.filtered_marketing_excluded_count) || 0),
    lifetimeRevenueCents: Math.max(0, Number(row.filtered_lifetime_revenue_cents) || 0),
    periodRevenueCents: Math.max(0, Number(row.filtered_period_revenue_cents) || 0),
  };
}

module.exports = {
  COMPLETED_STATUSES,
  CUSTOMER_PAGE_SIZE_OPTIONS,
  CUSTOMER_SEGMENTS,
  DEFAULT_CUSTOMER_PAGE_SIZE,
  LAPSED_DAY_OPTIONS,
  MAX_DETAIL_PAGE_SIZE,
  MAX_EXPORT_PAGE_SIZE,
  ORDER_PERIODS,
  OUTBOUND_SUPPRESSION_REASONS,
  SETTLED_IDENTITY_STATUSES,
  addSuppression,
  aggregateCustomers,
  createCustomerStats,
  createFilteredSummary,
  createSuppressionIndex,
  customerFromSummaryRow,
  customerMatchesSegment,
  filteredSummaryFromRow,
  isValidCustomerEmail,
  loadSuppressionIndex,
  normalizeSuppressionCandidates,
  normalizeEmail,
  positiveInteger,
  resolveDetailPagination,
  resolveEffectiveOrderStatus,
  resolveExportPageSize,
  resolveListPagination,
  resolveCustomerEmail,
  resolvePeriodRange,
  statsFromRow,
  splitCustomerName,
  probeSuppressionSources,
  suppressionReasonsForEmail,
};
