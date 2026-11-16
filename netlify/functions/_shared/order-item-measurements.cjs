'use strict';

// Neon returns standalone Postgres NUMERIC columns as strings, while JSON
// aggregates return numbers. Keep the order API identical for both read paths.
// Missing/invalid values stay missing; never round a customer's measurements.
function normalizeOrderItemMeasurements(item) {
  if (!item || typeof item !== 'object') return item;
  const result = { ...item };
  for (const field of ['width_in', 'height_in', 'rope_feet']) {
    if (!(field in item)) continue;
    const value = item[field];
    const numeric = typeof value === 'number' ? value
      : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
    result[field] = Number.isFinite(numeric) ? numeric : null;
  }
  return result;
}

module.exports = { normalizeOrderItemMeasurements };
