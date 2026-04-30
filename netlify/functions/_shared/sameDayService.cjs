/**
 * CommonJS mirror of src/lib/sameDayConfig.ts and src/lib/sameDayService.ts
 * for Netlify functions. Keep this in sync with the TS originals.
 */

const sameDayConfig = {
  enabled: true,
  cutoffHour: 12,
  cutoffMinute: 0,
  resetHour: 0,
  upchargeRate: 0.60,
  saturdayDeliveryFee: 45,
  eligibleProducts: ['banners', 'yardSigns', 'magnets'],
  maxQuantities: {
    banners: 25,
    yardSigns: 50,
    magnets: 50,
  },
};

const PRODUCT_SLUG_TO_SAME_DAY_KEY = {
  banner: 'banners',
  yard_sign: 'yardSigns',
  car_magnet: 'magnets',
};

function getSameDayKeyForProduct(productType) {
  if (!productType) return null;
  return PRODUCT_SLUG_TO_SAME_DAY_KEY[productType] || null;
}

const ET_TIME_ZONE = 'America/New_York';

const ET_DTF = new Intl.DateTimeFormat('en-US', {
  timeZone: ET_TIME_ZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function getEasternTimeParts(now) {
  const d = now || new Date();
  const parts = ET_DTF.formatToParts(d);
  const map = {};
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
  let hour = parseInt(map.hour || '0', 10);
  if (hour === 24) hour = 0;
  const minute = parseInt(map.minute || '0', 10);
  const second = parseInt(map.second || '0', 10);
  const dayOfWeek = WEEKDAY_INDEX[map.weekday] != null ? WEEKDAY_INDEX[map.weekday] : 0;
  const display = `${map.year}-${map.month}-${map.day} ${String(hour).padStart(2, '0')}:${map.minute}:${map.second} ET`;
  return { hour, minute, second, dayOfWeek, display, utcIso: d.toISOString() };
}

function isSameDayWindowOpen(now, cfg) {
  cfg = cfg || sameDayConfig;
  if (!cfg.enabled) return false;
  // New policy: HIT window is 22:01 ET (prev day) → 12:00 ET (exclusive),
  // AND weekend lock (Thu>=22:00 / Fri / Sat / Sun, plus blackouts) makes
  // HIT unavailable. Mirror of src/lib/delivery/engine.ts.
  const p = getEasternTimeParts(now);
  // Window-open check: hour < 12 OR (hour > 22) OR (hour == 22 && minute >= 1).
  let windowOpen = false;
  if (p.hour < 12) windowOpen = true;
  else if (p.hour > 22) windowOpen = true;
  else if (p.hour === 22 && p.minute >= 1) windowOpen = true;
  if (!windowOpen) return false;
  // Weekend lock check.
  const dow = p.dayOfWeek;
  if (dow === 5 || dow === 6 || dow === 0) return false;             // Fri / Sat / Sun
  if (dow === 4 && (p.hour > 22 || (p.hour === 22 && p.minute >= 0))) return false; // Thu >= 22:00
  return true;
}

function qualifiesForSaturdayDelivery(now, cfg) {
  cfg = cfg || sameDayConfig;
  if (!isSameDayWindowOpen(now, cfg)) return false;
  // Saturday delivery is meaningless under the new weekend-lock rules
  // (Friday is locked) but kept here for forward compatibility.
  return getEasternTimeParts(now).dayOfWeek === 5;
}

function isProductEligible(productType, quantity, cfg) {
  cfg = cfg || sameDayConfig;
  const key = getSameDayKeyForProduct(productType);
  if (!key) return false;
  if (!cfg.eligibleProducts.includes(key)) return false;
  const max = cfg.maxQuantities[key];
  if (typeof max === 'number' && quantity > max) return false;
  return true;
}

function getEligibleSubtotalCents(items, cfg) {
  cfg = cfg || sameDayConfig;
  let total = 0;
  for (const item of items || []) {
    const qty = item.quantity != null ? item.quantity : 1;
    if (!isProductEligible(item.product_type, qty, cfg)) continue;
    total += item.line_total_cents || 0;
  }
  return total;
}

function computeSameDayFeesCents(eligibleSubtotalCents, flags, cfg) {
  cfg = cfg || sameDayConfig;
  let sameDayFeeCents = 0;
  let saturdayFeeCents = 0;
  if (flags && flags.sameDay && eligibleSubtotalCents > 0) {
    sameDayFeeCents = Math.round(eligibleSubtotalCents * cfg.upchargeRate);
    if (flags.saturday) {
      saturdayFeeCents = Math.round(cfg.saturdayDeliveryFee * 100);
    }
  }
  return {
    sameDayFeeCents,
    saturdayFeeCents,
    totalAddOnCents: sameDayFeeCents + saturdayFeeCents,
  };
}

function evaluateSameDayEligibility({ now, items, cfg }) {
  cfg = cfg || sameDayConfig;
  const d = now || new Date();
  const ETnow = getEasternTimeParts(d);
  if (!cfg.enabled) {
    return {
      windowOpen: false, saturdayEligible: false, hasEligibleItem: false,
      eligibleItems: [], eligibleSubtotalCents: 0, reason: 'feature_disabled', ETnow,
    };
  }
  const windowOpen = isSameDayWindowOpen(d, cfg);
  const saturdayEligible = qualifiesForSaturdayDelivery(d, cfg);

  const productMatched = (items || []).filter((i) => !!getSameDayKeyForProduct(i.product_type));
  const eligibleItems = (items || []).filter((i) =>
    isProductEligible(i.product_type, i.quantity != null ? i.quantity : 1, cfg),
  );
  const eligibleSubtotalCents = getEligibleSubtotalCents(eligibleItems, cfg);

  let reason = 'available';
  if (!windowOpen) reason = 'window_closed';
  else if (productMatched.length === 0) reason = 'no_eligible_items';
  else if (eligibleItems.length === 0) reason = 'over_max_quantity';

  return {
    windowOpen,
    saturdayEligible,
    hasEligibleItem: eligibleItems.length > 0,
    eligibleItems,
    eligibleSubtotalCents,
    reason,
    ETnow,
  };
}

/**
 * Server-side fee enforcement. Given client-supplied flags + items, return
 * the *authoritative* same-day flags and fees. Never trust client values.
 */
function reconcileSameDayFlags({ now, items, requestedSameDay, requestedSaturday, cfg }) {
  const evalResult = evaluateSameDayEligibility({ now, items, cfg });
  let sameDay = false;
  let saturday = false;
  let rejectionReason = null;

  if (requestedSameDay) {
    if (!evalResult.windowOpen) {
      rejectionReason = 'window_closed';
    } else if (!evalResult.hasEligibleItem) {
      rejectionReason = evalResult.reason === 'over_max_quantity' ? 'over_max_quantity' : 'no_eligible_items';
    } else {
      sameDay = true;
      if (requestedSaturday && evalResult.saturdayEligible) {
        saturday = true;
      }
    }
  }

  const fees = computeSameDayFeesCents(
    evalResult.eligibleSubtotalCents,
    { sameDay, saturday },
    cfg,
  );

  return {
    sameDay,
    saturday,
    rejectionReason,
    fees,
    eval: evalResult,
  };
}

module.exports = {
  sameDayConfig,
  PRODUCT_SLUG_TO_SAME_DAY_KEY,
  getSameDayKeyForProduct,
  getEasternTimeParts,
  isSameDayWindowOpen,
  qualifiesForSaturdayDelivery,
  isProductEligible,
  getEligibleSubtotalCents,
  computeSameDayFeesCents,
  evaluateSameDayEligibility,
  reconcileSameDayFlags,
};
