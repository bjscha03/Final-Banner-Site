import { isCustomerTrackingAllowed } from './trackingPolicy';
import {
  ensureGtagQueue,
  ensureMetaQueue,
  sendClarity,
  sendGtag,
  sendMeta,
} from './trackingRuntime';

export const ANALYTICS_IDS = Object.freeze({
  ga4: 'G-2TQ6JYYZV7',
  metaPixel: '1487321805934457',
  clarity: 'vb952a5v2f',
  contentsquare: 'f68a18990d1b7',
  linkedInPartner: '8163164',
});

let initialized = false;
const scheduledTimers = new Set<number>();

export type GoogleTagLoadState = 'idle' | 'loading' | 'loaded' | 'failed';

const GOOGLE_TAG_SCRIPT_ID = 'botf-google-tag';
const GOOGLE_TAG_MAX_ATTEMPTS = 2;
const GOOGLE_TAG_RETRY_DELAY_MS = 1_000;
const GOOGLE_TAG_LOAD_TIMEOUT_MS = 8_000;

let googleTagLoadState: GoogleTagLoadState = 'idle';
let googleTagLoadAttempts = 0;
let googleTagScript: HTMLScriptElement | null = null;
let googleTagRetryTimer: number | null = null;
let googleTagLoadTimeoutTimer: number | null = null;
let googleTagRetryExhaustedReported = false;
let googleTagLoadGeneration = 0;
let googleTagLoadsStopped = false;

const addScriptOnce = (id: string, src: string): void => {
  if (!isCustomerTrackingAllowed() || document.getElementById(id)) return;
  const script = document.createElement('script');
  script.id = id;
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
};

const scheduleWhileEligible = (callback: () => void, delayMs: number): void => {
  const timer = window.setTimeout(() => {
    scheduledTimers.delete(timer);
    if (isCustomerTrackingAllowed()) callback();
  }, delayMs);
  scheduledTimers.add(timer);
};

const initializeClarity = (): void => {
  if (!isCustomerTrackingAllowed()) return;
  if (!window.clarity) {
    window.clarity = (...args: unknown[]) => {
      const clarity = window.clarity as ((...params: unknown[]) => void) & { q?: unknown[][] };
      clarity.q = clarity.q || [];
      clarity.q.push(args);
    };
  }
  addScriptOnce('botf-clarity', `https://www.clarity.ms/tag/${ANALYTICS_IDS.clarity}`);
};

const clearGoogleTagLoadTimeout = (): void => {
  if (googleTagLoadTimeoutTimer === null) return;
  window.clearTimeout(googleTagLoadTimeoutTimer);
  googleTagLoadTimeoutTimer = null;
};

const detachGoogleTagScript = (script: HTMLScriptElement): void => {
  script.onload = null;
  script.onerror = null;
  script.remove();
  if (googleTagScript === script) googleTagScript = null;
};

const reportGoogleTagRetryExhausted = (): void => {
  if (googleTagRetryExhaustedReported) return;
  googleTagRetryExhaustedReported = true;
  sendClarity('event', 'ga_tag_retry_exhausted');
};

const getGoogleTagSrc = (attempt: number): string => {
  const base = `https://www.googletagmanager.com/gtag/js?id=${ANALYTICS_IDS.ga4}`;
  if (attempt === 1) return base;
  // A single cache-busted retry recovers transient CDN/cache failures. It does
  // not change hostnames or attempt to evade deliberate tracker blocking.
  return `${base}&botf_retry=${attempt - 1}&botf_cb=${Date.now()}`;
};

const startGoogleTagLoad = (): void => {
  if (googleTagLoadsStopped || !isCustomerTrackingAllowed()) return;
  if (googleTagLoadState === 'loading' || googleTagLoadState === 'loaded') return;
  if (googleTagLoadAttempts >= GOOGLE_TAG_MAX_ATTEMPTS) {
    googleTagLoadState = 'failed';
    reportGoogleTagRetryExhausted();
    return;
  }

  const attempt = ++googleTagLoadAttempts;
  const generation = ++googleTagLoadGeneration;
  const script = document.createElement('script');
  script.id = GOOGLE_TAG_SCRIPT_ID;
  script.async = true;
  script.src = getGoogleTagSrc(attempt);

  googleTagScript = script;
  googleTagLoadState = 'loading';

  const isCurrentAttempt = (): boolean => (
    !googleTagLoadsStopped
    && googleTagLoadGeneration === generation
    && googleTagScript === script
  );

  const failCurrentAttempt = (): void => {
    if (!isCurrentAttempt() || googleTagLoadState !== 'loading') return;
    clearGoogleTagLoadTimeout();
    googleTagLoadState = 'failed';
    detachGoogleTagScript(script);
    sendClarity('event', 'ga_tag_load_error');

    if (googleTagLoadAttempts >= GOOGLE_TAG_MAX_ATTEMPTS) {
      reportGoogleTagRetryExhausted();
      return;
    }

    googleTagRetryTimer = window.setTimeout(() => {
      googleTagRetryTimer = null;
      if (
        googleTagLoadsStopped
        || googleTagLoadGeneration !== generation
        || !isCustomerTrackingAllowed()
      ) return;
      startGoogleTagLoad();
    }, GOOGLE_TAG_RETRY_DELAY_MS);
  };

  script.onload = () => {
    if (!isCurrentAttempt() || googleTagLoadState !== 'loading') return;
    clearGoogleTagLoadTimeout();
    googleTagLoadState = 'loaded';
    script.onload = null;
    script.onerror = null;
  };
  script.onerror = failCurrentAttempt;

  googleTagLoadTimeoutTimer = window.setTimeout(failCurrentAttempt, GOOGLE_TAG_LOAD_TIMEOUT_MS);
  document.head.appendChild(script);
};

export const getGoogleTagLoadState = (): GoogleTagLoadState => googleTagLoadState;

const initializeLinkedIn = (): void => {
  if (!isCustomerTrackingAllowed()) return;
  window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
  if (!window._linkedin_data_partner_ids.includes(ANALYTICS_IDS.linkedInPartner)) {
    window._linkedin_data_partner_ids.push(ANALYTICS_IDS.linkedInPartner);
  }
  if (!window.lintrk) {
    window.lintrk = (...args: unknown[]) => {
      const lintrk = window.lintrk as ((...params: unknown[]) => void) & { q?: unknown[][] };
      lintrk.q = lintrk.q || [];
      lintrk.q.push(args);
    };
  }
  addScriptOnce('botf-linkedin-insight', 'https://snap.licdn.com/li.lms-analytics/insight.min.js');
};

export const initializeCustomerAnalytics = (): boolean => {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !isCustomerTrackingAllowed()) return false;
  if (initialized) return true;
  initialized = true;

  ensureGtagQueue();
  sendGtag('js', new Date());
  // Every page view is emitted by AnalyticsController. This prevents the
  // initial config hit from duplicating the explicit SPA page_view event.
  sendGtag('config', ANALYTICS_IDS.ga4, { send_page_view: false });
  const googleAdsConversionId = import.meta.env.VITE_GOOGLE_ADS_CONVERSION_ID;
  if (googleAdsConversionId) {
    // Register the Ads destination before any conversion event. Page views
    // remain owned by AnalyticsController, so this cannot duplicate them.
    sendGtag('config', googleAdsConversionId, { send_page_view: false });
  }
  // Install Clarity's queue before loading Google so a Google script failure
  // can be surfaced in the same eligible session without PII.
  initializeClarity();
  startGoogleTagLoad();

  ensureMetaQueue();
  sendMeta('init', ANALYTICS_IDS.metaPixel);
  addScriptOnce('botf-meta-pixel', 'https://connect.facebook.net/en_US/fbevents.js');

  scheduleWhileEligible(
    () => addScriptOnce('botf-contentsquare', `https://t.contentsquare.net/uxa/${ANALYTICS_IDS.contentsquare}.js`),
    3000,
  );
  scheduleWhileEligible(initializeLinkedIn, 5000);
  return true;
};

export const stopScheduledAnalyticsLoads = (): void => {
  googleTagLoadsStopped = true;
  googleTagLoadGeneration += 1;
  for (const timer of scheduledTimers) window.clearTimeout(timer);
  scheduledTimers.clear();
  if (googleTagRetryTimer !== null) {
    window.clearTimeout(googleTagRetryTimer);
    googleTagRetryTimer = null;
  }
  clearGoogleTagLoadTimeout();
  if (googleTagScript !== null) detachGoogleTagScript(googleTagScript);
  if (googleTagLoadState === 'loading') googleTagLoadState = 'failed';
};
