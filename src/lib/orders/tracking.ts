import type { TrackingCarrier } from './types';

export interface TrackingEntry {
  carrier: TrackingCarrier;
  trackingNumber: string;
  label?: string;
}

export const DEFAULT_TRACKING_CARRIER: TrackingCarrier = 'fedex';

export const getTrackingUrl = (entry: Pick<TrackingEntry, 'carrier' | 'trackingNumber'>): string => {
  const n = encodeURIComponent(entry.trackingNumber.trim());
  return `https://www.fedex.com/fedextrack/?trknbr=${n}`;
};

export const fedexUrl = (trackingNumber: string): string => getTrackingUrl({ carrier: 'fedex', trackingNumber });

export const normalizeTrackingEntries = (orderOrEntries: any): TrackingEntry[] => {
  const raw = Array.isArray(orderOrEntries)
    ? orderOrEntries
    : Object.prototype.hasOwnProperty.call(orderOrEntries || {}, 'tracking_numbers')
      ? orderOrEntries?.tracking_numbers
      : orderOrEntries?.trackingNumbers;
  const hasExplicitTrackingArray = Array.isArray(raw);
  const legacy = !Array.isArray(orderOrEntries) ? orderOrEntries?.tracking_number : null;
  const source = hasExplicitTrackingArray ? raw : (legacy ? [{ carrier: orderOrEntries?.tracking_carrier || DEFAULT_TRACKING_CARRIER, trackingNumber: legacy }] : []);
  const seen = new Set<string>();
  return source
    .map((entry: any, index: number) => ({
      carrier: DEFAULT_TRACKING_CARRIER,
      trackingNumber: String(entry?.trackingNumber ?? entry?.tracking_number ?? entry?.number ?? '').trim(),
      label: String(entry?.label ?? '').trim() || `Package ${index + 1}`,
    }))
    .filter((entry: TrackingEntry) => entry.trackingNumber)
    .filter((entry: TrackingEntry) => {
      const key = entry.trackingNumber.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

export const validateTrackingEntries = (entries: TrackingEntry[]): TrackingEntry[] => {
  const normalized = normalizeTrackingEntries(entries);
  if (normalized.length !== entries.length) throw new Error('Tracking rows cannot be blank or duplicated.');
  return normalized;
};
