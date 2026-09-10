import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { initializeCustomerAnalytics, stopScheduledAnalyticsLoads } from '@/lib/analyticsLoader';
import { trackFBPageView, trackPageView } from '@/lib/analytics';
import { initPostHog, trackPostHogPageView } from '@/lib/posthog';
import { getSanitizedAnalyticsPath, isCustomerTrackingAllowed } from '@/lib/trackingPolicy';
import { markCurrentDeviceAsInternal } from '@/lib/trackingPolicy';
import { isAdmin, useAuth } from '@/lib/auth';

/**
 * The only route-level analytics entrypoint. It loads tags exclusively for a
 * production customer route and emits one sanitized page view per navigation.
 */
const AnalyticsController = () => {
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const lastNavigationRef = useRef<string | null>(null);
  const wasAllowedRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (isAdmin(user)) markCurrentDeviceAsInternal();
    const allowed = isCustomerTrackingAllowed();

    // A hard boundary prevents already-loaded session-replay and advertising
    // libraries from following a customer-side SPA navigation into /admin.
    if (!allowed && wasAllowedRef.current === true) {
      stopScheduledAnalyticsLoads();
      window.location.reload();
      return;
    }
    wasAllowedRef.current = allowed;
    if (!allowed) return;

    initializeCustomerAnalytics();
    initPostHog();

    const pagePath = getSanitizedAnalyticsPath(window.location);
    const navigationId = `${location.key}:${pagePath}`;
    if (lastNavigationRef.current === navigationId) return;
    lastNavigationRef.current = navigationId;

    // Helmet updates the document title in the same commit. Queueing one task
    // ensures the page_view receives the route-specific title.
    const timer = window.setTimeout(() => {
      trackPageView({ page_title: document.title, page_path: pagePath });
      trackFBPageView();
      trackPostHogPageView(pagePath);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [authLoading, location.key, location.pathname, location.search, user]);

  return null;
};

export default AnalyticsController;
