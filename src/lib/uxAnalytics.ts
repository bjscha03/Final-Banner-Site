/**
 * Lightweight UX-flow event logger.
 *
 * Distinct from `src/lib/analytics.ts` (which targets GA4 ecommerce events).
 * `logUx` is intentionally tiny and side-effect-safe so it can be sprinkled
 * across the mobile order flow (sticky CTA, step transitions, upload phases,
 * upsell, cart, checkout, account modal) without becoming a maintenance
 * burden.
 *
 * - Always writes a single namespaced console line so it shows up in
 *   Microsoft Clarity session replays and DevTools without any extra
 *   wiring.
 * - When `window.clarity` is available it also fires a Clarity custom
 *   event with the same name (Clarity supports
 *   `clarity('event', name)` and `clarity('set', key, value)`).
 *
 * Never throws. Safe in SSR (no-ops when `window` is undefined).
 */

declare global {
  interface Window {
    clarity?: (...args: unknown[]) => void;
  }
}

export type UxEvent =
  | 'cta_click'
  | 'sticky_cta_rendered'
  | 'step_validation_failed'
  | 'step_scrolled'
  | 'upload_start'
  | 'upload_success'
  | 'upload_error'
  | 'upload_timeout'
  | 'preview_opened'
  | 'preview_done'
  | 'quantity_valid'
  | 'quantity_invalid'
  | 'finishing_reviewed'
  | 'upsell_opened'
  | 'add_to_cart_attempted'
  | 'add_to_cart_blocked'
  | 'add_to_cart_completed'
  | 'post_add_to_cart_cta_rendered'
  | 'cart_opened'
  | 'hit_selected'
  | 'hit_unselected'
  | 'checkout_started'
  | 'account_modal_shown'
  | 'account_modal_dismissed';

export type UxPayload = Record<string, unknown> | undefined;

/**
 * Emit a UX-flow event.
 *
 * @param event Stable, snake_case event name.
 * @param payload Optional small JSON-serializable context.
 */
export function logUx(event: UxEvent, payload?: UxPayload): void {
  try {
    // Console line — visible in DevTools and captured by Clarity replays.
    if (payload && Object.keys(payload).length > 0) {
      // eslint-disable-next-line no-console
      console.info(`[ux] ${event}`, payload);
    } else {
      // eslint-disable-next-line no-console
      console.info(`[ux] ${event}`);
    }

    if (typeof window === 'undefined') return;
    const clarity = window.clarity;
    if (typeof clarity !== 'function') return;

    // Fire as a Clarity custom event for funnel analysis.
    clarity('event', event);
    if (payload) {
      for (const [key, value] of Object.entries(payload)) {
        if (value === undefined || value === null) continue;
        // Clarity 'set' tags are string-only.
        const str = typeof value === 'string' ? value : JSON.stringify(value);
        // Truncate so we never blow past Clarity's tag value limit.
        clarity('set', `${event}.${key}`, str.length > 200 ? str.slice(0, 200) : str);
      }
    }
  } catch {
    // Observability must never break the page.
  }
}
