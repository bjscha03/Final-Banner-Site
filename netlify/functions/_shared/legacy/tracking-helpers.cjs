const DEFAULT_TRACKING_CARRIER = 'fedex';
function getTrackingUrl(entry) {
  return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(String(entry.trackingNumber || '').trim())}`;
}
function normalizeTrackingEntries(orderOrEntries) {
  const raw = Array.isArray(orderOrEntries)
    ? orderOrEntries
    : Object.prototype.hasOwnProperty.call(orderOrEntries || {}, 'tracking_numbers')
      ? orderOrEntries && orderOrEntries.tracking_numbers
      : orderOrEntries && orderOrEntries.trackingNumbers;
  const hasExplicitTrackingArray = Array.isArray(raw);
  const legacy = !Array.isArray(orderOrEntries) && orderOrEntries ? orderOrEntries.tracking_number : null;
  const source = hasExplicitTrackingArray ? raw : (legacy ? [{ carrier: orderOrEntries.tracking_carrier || DEFAULT_TRACKING_CARRIER, trackingNumber: legacy }] : []);
  const seen = new Set();
  return source.map((entry, index) => ({
    carrier: DEFAULT_TRACKING_CARRIER,
    trackingNumber: String((entry && (entry.trackingNumber || entry.tracking_number || entry.number)) || '').trim(),
    label: String((entry && entry.label) || '').trim() || `Package ${index + 1}`,
  })).filter((entry) => entry.trackingNumber).filter((entry) => {
    const key = entry.trackingNumber.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function validateTrackingEntries(entries) {
  if (!Array.isArray(entries)) throw new Error('trackingNumbers must be an array');
  const blank = entries.some((entry) => !String((entry && (entry.trackingNumber || entry.tracking_number || entry.number)) || '').trim());
  const normalized = normalizeTrackingEntries(entries);
  if (blank) throw new Error('Blank tracking rows are not allowed');
  if (normalized.length !== entries.length) throw new Error('Duplicate tracking numbers are not allowed');
  return normalized;
}
module.exports = { DEFAULT_TRACKING_CARRIER, getTrackingUrl, normalizeTrackingEntries, validateTrackingEntries };

