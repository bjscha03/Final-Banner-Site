/**
 * Checkout analytics lifecycle. Session storage survives reloads and history navigation,
 * unlike React refs, but expires with the browser tab.
 * A changed cart fingerprint represents a new checkout initiation.
 */
const PREFIX = 'bof:checkout-analytics:v1:';
const ACTIVE = PREFIX + 'active';
const memory = new Map<string, string>();

function read(key: string): string | null {
  try { return window.sessionStorage.getItem(key); } catch { return memory.get(key) ?? null; }
}
function write(key: string, value: string): void {
  memory.set(key, value);
  try { window.sessionStorage.setItem(key, value); } catch { /* storage disabled */ }
}
function remove(key: string): void {
  memory.delete(key);
  try { window.sessionStorage.removeItem(key); } catch { /* storage disabled */ }
}

export type CheckoutFingerprintItem = {
  id: string;
  quantity: number;
  line_total_cents: number;
  width_in?: number;
  height_in?: number;
  material?: string;
  product_type?: string;
  file_key?: string | null;
};

/** Stable across hydration and reorder, but changes for item edits/adds/removals. */
export function checkoutCartFingerprint(items: CheckoutFingerprintItem[]): string {
  return JSON.stringify(items.map(item => [
    item.id, item.quantity, item.line_total_cents, item.width_in,
    item.height_in, item.material, item.product_type, item.file_key ?? null,
  ]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

/** Returns true only for the first checkout entry with this cart in this tab. */
export function markCheckoutInitiated(fingerprint: string): boolean {
  if (!fingerprint || fingerprint === '[]') return false;
  if (read(ACTIVE) === fingerprint && read(PREFIX + 'begun') === '1') return false;
  // New cart invalidates the previous checkout's step markers.
  remove(PREFIX + 'payment-ready');
  write(ACTIVE, fingerprint);
  write(PREFIX + 'begun', '1');
  return true;
}

/** Deduplicate the readiness signal by payment provider/method per checkout. */
export function markPaymentFieldsReady(provider: string, method: string = '', fingerprint: string): boolean {
  if (!fingerprint || fingerprint === '[]') return false;
  const key = provider + ':' + method;
  const stored = read(PREFIX + 'payment-ready');
  const state = stored ? JSON.parse(stored) as { fingerprint: string; methods: string[] } : null;
  const seen = new Set(state?.fingerprint === fingerprint ? state.methods : []);
  if (seen.has(key)) return false;
  seen.add(key);
  write(PREFIX + 'payment-ready', JSON.stringify({ fingerprint, methods: [...seen] }));
  return true;
}

/** Purchase ends the checkout lifecycle without changing purchase tracking. */
export function clearCheckoutAnalyticsSession(): void {
  for (const suffix of ['active', 'begun', 'payment-ready']) remove(PREFIX + suffix);
}
