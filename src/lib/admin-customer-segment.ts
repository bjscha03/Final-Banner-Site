export type AdminCustomerSegment = 'all' | 'first_time' | 'repeat' | 'lapsed';

/**
 * Keep the public Admin URL readable while preserving the API's established
 * `first_time` segment contract.
 */
export const resolveAdminCustomerSegment = (value: string | null | undefined): AdminCustomerSegment => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'new' || normalized === 'first_time') return 'first_time';
  if (normalized === 'repeat') return 'repeat';
  if (normalized === 'lapsed') return 'lapsed';
  return 'all';
};

export const adminCustomerSegmentUrlValue = (segment: AdminCustomerSegment): string | null => {
  if (segment === 'first_time') return 'new';
  if (segment === 'repeat' || segment === 'lapsed') return segment;
  return null;
};

export const withAdminCustomerSegment = (
  current: URLSearchParams,
  segment: AdminCustomerSegment,
): URLSearchParams => {
  const next = new URLSearchParams(current);
  const value = adminCustomerSegmentUrlValue(segment);
  if (value) next.set('segment', value);
  else next.delete('segment');
  return next;
};
