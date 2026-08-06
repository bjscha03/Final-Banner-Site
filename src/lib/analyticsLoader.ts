import { isCustomerTrackingAllowed } from './trackingPolicy';
import { ensureGtagQueue, ensureMetaQueue, sendGtag, sendMeta } from './trackingRuntime';

export const ANALYTICS_IDS = Object.freeze({
  ga4: 'G-2TQ6JYYZV7',
  metaPixel: '1487321805934457',
  clarity: 'vb952a5v2f',
  contentsquare: 'f68a18990d1b7',
  linkedInPartner: '8163164',
});

let initialized = false;
const scheduledTimers = new Set<number>();

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
  addScriptOnce('botf-google-tag', `https://www.googletagmanager.com/gtag/js?id=${ANALYTICS_IDS.ga4}`);

  ensureMetaQueue();
  sendMeta('init', ANALYTICS_IDS.metaPixel);
  addScriptOnce('botf-meta-pixel', 'https://connect.facebook.net/en_US/fbevents.js');

  initializeClarity();
  scheduleWhileEligible(
    () => addScriptOnce('botf-contentsquare', `https://t.contentsquare.net/uxa/${ANALYTICS_IDS.contentsquare}.js`),
    3000,
  );
  scheduleWhileEligible(initializeLinkedIn, 5000);
  return true;
};

export const stopScheduledAnalyticsLoads = (): void => {
  for (const timer of scheduledTimers) window.clearTimeout(timer);
  scheduledTimers.clear();
};
