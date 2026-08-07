import { isCustomerTrackingAllowed } from './trackingPolicy';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    _fbq?: (...args: unknown[]) => void;
    lintrk?: (...args: unknown[]) => void;
    clarity?: (...args: unknown[]) => void;
    _linkedin_data_partner_ids?: string[];
  }
}

export const ensureGtagQueue = (): boolean => {
  if (typeof window === 'undefined' || !isCustomerTrackingAllowed()) return false;
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    // Google Tag's command parser distinguishes the native `arguments`
    // object from a JavaScript Array. Using a rest parameter here creates an
    // Array and causes `config`, `event`, `js`, and `get` commands to be
    // ignored by gtag.js even though they appear to be queued successfully.
    // Keep this function in the canonical Google shape.
    window.gtag = function gtag() {
      window.dataLayer!.push(arguments);
    };
  }
  return true;
};

export const sendGtag = (...args: unknown[]): boolean => {
  if (!ensureGtagQueue()) return false;
  window.gtag!(...args);
  return true;
};

export const ensureMetaQueue = (): boolean => {
  if (typeof window === 'undefined' || !isCustomerTrackingAllowed()) return false;
  if (!window.fbq) {
    const queue = function fbq(...args: unknown[]) {
      const target = queue as typeof queue & {
        callMethod?: (...params: unknown[]) => void;
        queue: unknown[][];
      };
      if (target.callMethod) target.callMethod(...args);
      else target.queue.push(args);
    } as typeof window.fbq & {
      push?: (...args: unknown[]) => void;
      loaded?: boolean;
      version?: string;
      queue: unknown[][];
    };
    queue.push = queue;
    queue.loaded = true;
    queue.version = '2.0';
    queue.queue = [];
    window.fbq = queue;
    window._fbq = queue;
  }
  return true;
};

export const sendMeta = (...args: unknown[]): boolean => {
  if (!ensureMetaQueue()) return false;
  window.fbq!(...args);
  return true;
};

export const sendClarity = (...args: unknown[]): boolean => {
  if (typeof window === 'undefined' || !isCustomerTrackingAllowed() || typeof window.clarity !== 'function') return false;
  window.clarity(...args);
  return true;
};

export const sendLinkedIn = (...args: unknown[]): boolean => {
  if (typeof window === 'undefined' || !isCustomerTrackingAllowed() || typeof window.lintrk !== 'function') return false;
  window.lintrk(...args);
  return true;
};
