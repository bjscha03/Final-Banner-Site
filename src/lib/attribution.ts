export type AttributionPayload = {
  google_click_id?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  landing_page?: string | null;
  referrer?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  consent_status?: string | null;
  captured_at?: string | null;
};

const STORAGE_KEY = 'botf_attribution_v1';
const ATTRIBUTION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

const readStored = (): AttributionPayload => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) || window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed.captured_at) {
      const age = Date.now() - new Date(parsed.captured_at).getTime();
      if (Number.isFinite(age) && age > ATTRIBUTION_RETENTION_MS) return {};
    }
    return parsed;
  } catch (_e) {
    return {};
  }
};

const writeStored = (payload: AttributionPayload) => {
  if (typeof window === 'undefined') return;
  try {
    const serialized = JSON.stringify(payload);
    window.localStorage.setItem(STORAGE_KEY, serialized);
    window.sessionStorage.setItem(STORAGE_KEY, serialized);
  } catch (_e) {
    // Attribution persistence is best-effort; checkout sends the current in-memory merge.
  }
};

export const captureAttributionFromLocation = (): AttributionPayload => {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const stored = readStored();
  const next: AttributionPayload = {
    ...stored,
    landing_page: stored.landing_page || window.location.href,
    referrer: stored.referrer || document.referrer || null,
    captured_at: stored.captured_at || new Date().toISOString(),
  };

  const gclid = params.get('gclid') || params.get('gclsrc');
  if (gclid) { next.google_click_id = gclid; next.captured_at = new Date().toISOString(); }
  const gbraid = params.get('gbraid');
  if (gbraid) { next.gbraid = gbraid; next.captured_at = new Date().toISOString(); }
  const wbraid = params.get('wbraid');
  if (wbraid) { next.wbraid = wbraid; next.captured_at = new Date().toISOString(); }
  UTM_KEYS.forEach((key) => {
    const value = params.get(key);
    if (value) next[key] = value;
  });

  // Preserve existing explicit consent integrations if one is later added.
  next.consent_status = next.consent_status || 'unknown';
  writeStored(next);
  return next;
};

export const getStoredAttribution = (): AttributionPayload => {
  const captured = captureAttributionFromLocation();
  return { ...readStored(), ...captured };
};
