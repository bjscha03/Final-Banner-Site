export type RecoveryStatus = 'active' | 'abandoned' | 'recovered' | 'expired' | string;

export interface AbandonedCartItemSummary {
  product_type: string;
  width_in: number | null;
  height_in: number | null;
  dimensions: string;
  area_sqft: number | null;
  material: string;
  quantity: number;
  line_total_cents: number | null;
  has_artwork: boolean | null;
}

export interface AbandonedCartAdminRecord {
  id: string;
  user_id: string | null;
  session_id: string | null;
  customer_kind: 'signed_in' | 'guest';
  customer_first_name: string | null;
  customer_last_name: string | null;
  email: string | null;
  phone: string | null;
  item_count: number;
  source_item_count: number | null;
  stored_item_count: number;
  snapshot_completeness: 'complete' | 'incomplete' | 'unknown';
  item_quantity: number;
  item_summaries: AbandonedCartItemSummary[];
  subtotal_cents: number | null;
  discount_cents: number | null;
  tax_cents: number | null;
  estimated_total_cents: number | null;
  captured_value_cents: number;
  total_value: number;
  currency: string;
  checkout_stage: string;
  checkout_stage_updated_at?: string | null;
  has_artwork: boolean | null;
  recovery_status: RecoveryStatus;
  recovery_emails_sent: number;
  discount_code: string | null;
  last_recovery_email_at: string | null;
  recovery_suppressed_at: string | null;
  recovery_suppression_reason: string | null;
  recovery_email_last_error?: string | null;
  last_activity_at: string;
  abandoned_at: string | null;
  recovered_at: string | null;
  recovered_order_id: string | null;
  recovered_order_status?: string | null;
  recovered_revenue_state?: 'retained' | 'refunded' | 'unknown' | null;
  created_at: string;
  first_item_thumbnail: string | null;
  item_summaries_truncated?: boolean;
}

export type EmailPresenceFilter = 'all' | 'with_email' | 'without_email';
export type AbandonedCartSort =
  | 'activity_desc'
  | 'captured_desc'
  | 'captured_asc'
  | 'value_desc'
  | 'value_asc'
  | 'quantity_desc';

export interface AbandonedCartFilters {
  fromDate: string;
  toDate: string;
  sizeQuery: string;
  minValue: string;
  maxValue: string;
  checkoutStage: string;
  emailPresence: EmailPresenceFilter;
  recoveryStatus: string;
}

export interface AbandonedCartFacet {
  label: string;
  count: number;
}

export interface AbandonedCartOutcomeBand {
  key: string;
  label: string;
  abandonedCount: number;
  completedCount: number;
  sampleSize: number;
  abandonmentRate: number | null;
  sufficientSample: boolean;
}

export interface AbandonedCartOutcomeComparison {
  terminalSampleSize: number;
  minimumSampleSize: number;
  minimumOutcomeCount: number;
  sizeClassifiedSampleSize: number;
  valueClassifiedSampleSize: number;
  sizeBands: AbandonedCartOutcomeBand[];
  valueBands: AbandonedCartOutcomeBand[];
}

export interface AbandonedCartAnalytics {
  totalCount: number;
  activeCount: number;
  abandonedCount: number;
  recoveredCount: number;
  recoveredRetainedCount: number;
  recoveredRefundedCount: number;
  recoveredRevenueUnknownCount: number;
  expiredCount: number;
  activeValueCents: number;
  recoveredValueCents: number;
  recoveredAfterEmailCount: number;
  recoveredAfterEmailRetainedCount: number;
  recoveredAfterEmailValueCents: number;
  suppressedCount: number;
  withEmailCount: number;
  abandonmentCohortCount: number;
  topSizes: AbandonedCartFacet[];
  topMaterials: AbandonedCartFacet[];
  topProducts: AbandonedCartFacet[];
  valueBands: AbandonedCartFacet[];
  checkoutStages: AbandonedCartFacet[];
  outcomeComparison?: AbandonedCartOutcomeComparison;
}

export const OUTCOME_MINIMUM_SAMPLE_SIZE = 20;
export const OUTCOME_MINIMUM_PER_OUTCOME = 5;

export const SIZE_OUTCOME_BANDS = [
  { key: 'small_medium', label: 'Small / medium (<18 sq ft; below 3×6)' },
  { key: 'large_plus', label: 'Large+ (≥18 sq ft; 3×6 or larger)' },
] as const;

export const VALUE_OUTCOME_BANDS = [
  { key: '$0–$49', label: '$0–$49' },
  { key: '$50–$99', label: '$50–$99' },
  { key: '$100–$249', label: '$100–$249' },
  { key: '$250–$499', label: '$250–$499' },
  { key: '$500+', label: '$500+' },
] as const;

export const EMPTY_ABANDONED_CART_FILTERS: AbandonedCartFilters = {
  fromDate: '',
  toDate: '',
  sizeQuery: '',
  minValue: '',
  maxValue: '',
  checkoutStage: 'all',
  emailPresence: 'all',
  recoveryStatus: 'all',
};

const clean = (value: unknown): string => String(value ?? '').trim().toLowerCase();

const finiteNumber = (value: string): number | null => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const capturedValueCents = (cart: AbandonedCartAdminRecord): number => (
  Number.isFinite(cart.captured_value_cents)
    ? cart.captured_value_cents
    : cart.estimated_total_cents ?? cart.subtotal_cents ?? 0
);

const dateAtStartOfDay = (value: string): number | null => {
  if (!value) return null;
  const time = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(time) ? time : null;
};

const dateAtEndOfDay = (value: string): number | null => {
  if (!value) return null;
  const time = new Date(`${value}T23:59:59.999`).getTime();
  return Number.isFinite(time) ? time : null;
};

export function isRecoveryEmailEligible(cart: AbandonedCartAdminRecord): boolean {
  return Boolean(
    cart.email
    && cart.recovery_status === 'abandoned'
    && !cart.recovery_suppressed_at
    && !cart.recovery_suppression_reason,
  );
}

export function filterAndSortAbandonedCarts(
  carts: AbandonedCartAdminRecord[],
  filters: AbandonedCartFilters,
  sort: AbandonedCartSort,
): AbandonedCartAdminRecord[] {
  const from = dateAtStartOfDay(filters.fromDate);
  const to = dateAtEndOfDay(filters.toDate);
  const minValue = finiteNumber(filters.minValue);
  const maxValue = finiteNumber(filters.maxValue);
  const sizeQuery = clean(filters.sizeQuery).replace(/\s+/g, '');

  const filtered = carts.filter((cart) => {
    const capturedAt = new Date(cart.created_at).getTime();
    if (from !== null && capturedAt < from) return false;
    if (to !== null && capturedAt > to) return false;

    const value = capturedValueCents(cart) / 100;
    if (minValue !== null && value < minValue) return false;
    if (maxValue !== null && value > maxValue) return false;

    if (filters.checkoutStage !== 'all' && cart.checkout_stage !== filters.checkoutStage) return false;
    if (filters.recoveryStatus !== 'all' && cart.recovery_status !== filters.recoveryStatus) return false;
    if (filters.emailPresence === 'with_email' && !cart.email) return false;
    if (filters.emailPresence === 'without_email' && cart.email) return false;

    if (sizeQuery) {
      const matchesSize = cart.item_summaries.some((item) => {
        const dimensions = clean(item.dimensions).replace(/\s+/g, '');
        const inches = item.width_in !== null && item.height_in !== null
          ? `${item.width_in}x${item.height_in}`.replace(/\s+/g, '')
          : '';
        return dimensions.includes(sizeQuery) || inches.includes(sizeQuery);
      });
      if (!matchesSize) return false;
    }

    return true;
  });

  return filtered.sort((left, right) => {
    switch (sort) {
      case 'captured_desc':
        return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
      case 'captured_asc':
        return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
      case 'value_desc':
        return capturedValueCents(right) - capturedValueCents(left);
      case 'value_asc':
        return capturedValueCents(left) - capturedValueCents(right);
      case 'quantity_desc':
        return right.item_quantity - left.item_quantity;
      case 'activity_desc':
      default:
        return new Date(right.last_activity_at).getTime() - new Date(left.last_activity_at).getTime();
    }
  });
}

function topFacets(values: Array<{ label: string; count: number }>, limit = 5): AbandonedCartFacet[] {
  const counts = new Map<string, number>();
  values.forEach(({ label, count }) => {
    const normalizedLabel = label.trim() || 'Unknown';
    counts.set(normalizedLabel, (counts.get(normalizedLabel) || 0) + Math.max(0, count));
  });
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, limit);
}

function cartFacetPresence(
  carts: AbandonedCartAdminRecord[],
  selectLabel: (item: AbandonedCartItemSummary) => string,
): Array<{ label: string; count: number }> {
  return carts.flatMap((cart) => {
    const labels = new Set(cart.item_summaries.map(selectLabel));
    return [...labels].map((label) => ({ label, count: 1 }));
  });
}

export function capturedValueBand(cents: number): string {
  const value = Math.max(0, Math.round(Number(cents) || 0));
  if (value < 5_000) return '$0–$49';
  if (value < 10_000) return '$50–$99';
  if (value < 25_000) return '$100–$249';
  if (value < 50_000) return '$250–$499';
  return '$500+';
}

const terminalOutcome = (cart: AbandonedCartAdminRecord): 'abandoned' | 'completed' | null => {
  const stage = clean(cart.checkout_stage);
  const knownPostRolloutStage = Boolean(cart.checkout_stage_updated_at)
    && ['cart', 'checkout', 'contact', 'payment_started'].includes(stage);
  if (!knownPostRolloutStage || cart.recovery_status === 'active') return null;
  if (cart.abandoned_at) return 'abandoned';
  return cart.recovery_status === 'recovered' ? 'completed' : null;
};

const largestBannerArea = (cart: AbandonedCartAdminRecord): number | null => {
  const areas = cart.item_summaries
    // Legacy missing product types normalize to `banner` at the API boundary;
    // explicit yard signs, magnets, posters, and future products do not belong
    // in a banner Size Guide comparison.
    .filter((item) => clean(item.product_type) === 'banner')
    .map((item) => {
      if (Number.isFinite(item.area_sqft) && Number(item.area_sqft) > 0) return Number(item.area_sqft);
      if (Number.isFinite(item.width_in) && Number.isFinite(item.height_in)) {
        const area = (Number(item.width_in) * Number(item.height_in)) / 144;
        return area > 0 ? area : null;
      }
      return null;
    })
    .filter((area): area is number => area !== null);
  return areas.length ? Math.max(...areas) : null;
};

const outcomeBand = (
  key: string,
  label: string,
  counts: Map<string, { abandoned: number; completed: number }>,
): AbandonedCartOutcomeBand => {
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
};

export function summarizeOutcomeComparison(carts: AbandonedCartAdminRecord[]): AbandonedCartOutcomeComparison {
  const sizeCounts = new Map<string, { abandoned: number; completed: number }>();
  const valueCounts = new Map<string, { abandoned: number; completed: number }>();
  let terminalSampleSize = 0;
  let sizeClassifiedSampleSize = 0;
  let valueClassifiedSampleSize = 0;

  const increment = (counts: Map<string, { abandoned: number; completed: number }>, key: string, outcome: 'abandoned' | 'completed') => {
    const current = counts.get(key) || { abandoned: 0, completed: 0 };
    current[outcome] += 1;
    counts.set(key, current);
  };

  carts.forEach((cart) => {
    const outcome = terminalOutcome(cart);
    if (!outcome) return;
    terminalSampleSize += 1;

    const valueBand = capturedValueBand(capturedValueCents(cart));
    increment(valueCounts, valueBand, outcome);
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

export function summarizeAbandonedCarts(carts: AbandonedCartAdminRecord[]): AbandonedCartAnalytics {
  const activeCarts = carts.filter((cart) => cart.recovery_status === 'active' || cart.recovery_status === 'abandoned');
  // A direct checkout can create a captured cart and mark it recovered without
  // ever producing an abandonment event. Recovery metrics only describe carts
  // that were actually abandoned first.
  const recoveredCarts = carts.filter((cart) => cart.recovery_status === 'recovered' && Boolean(cart.abandoned_at));
  const recoveredAfterEmail = recoveredCarts.filter((cart) => cart.recovery_emails_sent > 0);
  const retainedRecovered = recoveredCarts.filter((cart) => cart.recovered_revenue_state === 'retained');
  const retainedRecoveredAfterEmail = retainedRecovered.filter((cart) => cart.recovery_emails_sent > 0);
  const refundedRecovered = recoveredCarts.filter((cart) => cart.recovered_revenue_state === 'refunded');
  const unknownRecovered = recoveredCarts.filter((cart) => cart.recovered_revenue_state !== 'retained'
    && cart.recovered_revenue_state !== 'refunded');
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
    activeValueCents: activeCarts.reduce((sum, cart) => sum + capturedValueCents(cart), 0),
    recoveredValueCents: retainedRecovered.reduce((sum, cart) => sum + capturedValueCents(cart), 0),
    recoveredAfterEmailCount: recoveredAfterEmail.length,
    recoveredAfterEmailRetainedCount: retainedRecoveredAfterEmail.length,
    recoveredAfterEmailValueCents: retainedRecoveredAfterEmail.reduce((sum, cart) => sum + capturedValueCents(cart), 0),
    suppressedCount: carts.filter((cart) => Boolean(cart.recovery_suppressed_at || cart.recovery_suppression_reason)).length,
    withEmailCount: carts.filter((cart) => Boolean(cart.email)).length,
    abandonmentCohortCount: abandonmentCohort.length,
    topSizes: topFacets(cartFacetPresence(abandonmentCohort, (item) => item.dimensions || 'Unknown')),
    topMaterials: topFacets(cartFacetPresence(abandonmentCohort, (item) => item.material || 'Unknown')),
    topProducts: topFacets(cartFacetPresence(abandonmentCohort, (item) => item.product_type || 'banner')),
    valueBands: topFacets(abandonmentCohort.map((cart) => ({
      label: capturedValueBand(capturedValueCents(cart)),
      count: 1,
    })), 10),
    checkoutStages: topFacets(abandonmentCohort.map((cart) => ({ label: cart.checkout_stage || 'unknown', count: 1 })), 10),
    outcomeComparison: summarizeOutcomeComparison(carts),
  };
}
