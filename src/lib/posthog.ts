import posthog from 'posthog-js';

// Initialize PostHog
export const initPostHog = () => {
  const apiKey = import.meta.env.VITE_POSTHOG_API_KEY;
  const host = import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com';

  if (!apiKey) {
    // Analytics is optional. An intentionally absent key is not a runtime
    // warning and must not look like a storefront or AI configuration error.
    return;
  }

  posthog.init(apiKey, {
    api_host: host,
    autocapture: false, // Disable autocapture, we'll track manually
    capture_pageview: true,
    disable_session_recording: true, // Disable session recording for privacy
  });

  if (import.meta.env.DEV) console.log('[PostHog] Initialized');
};

// Track promo events
export const trackPromoEvent = (
  eventName: 'promo_shown' | 'promo_copied' | 'promo_applied_success' | 'promo_rejected',
  properties?: Record<string, unknown>
) => {
  try {
    posthog.capture(eventName, {
      ...properties,
      timestamp: new Date().toISOString(),
    });
    if (import.meta.env.DEV) console.log(`[PostHog] Event tracked: ${eventName}`, properties);
  } catch (error) {
    console.error('[PostHog] Failed to track event:', error);
  }
};

// Identify user
export const identifyUser = (userId: string, properties?: Record<string, unknown>) => {
  try {
    posthog.identify(userId, properties);
    if (import.meta.env.DEV) console.log('[PostHog] User identified:', userId);
  } catch (error) {
    console.error('[PostHog] Failed to identify user:', error);
  }
};

// Reset user (on logout)
export const resetUser = () => {
  try {
    posthog.reset();
    if (import.meta.env.DEV) console.log('[PostHog] User reset');
  } catch (error) {
    console.error('[PostHog] Failed to reset user:', error);
  }
};

export default posthog;
