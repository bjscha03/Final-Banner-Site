import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useCartStore } from '@/store/cart';
import { getStoredAttribution } from '@/lib/attribution';
import { gtag } from '@/lib/analytics';

const KEY = 'bof_email_popup_last_shown';
const PAID_SESSION = 'bof_paid_search_session';
const COOLDOWN_MS = 30 * 86400000;

export function usePromoPopup() {
  const route = useLocation();
  const discountCode = useCartStore(state => state.discountCode?.code);
  const [showPopup, setShowPopup] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(route.search);
    const source = (params.get('utm_source') || '').toLowerCase();
    const medium = (params.get('utm_medium') || '').toLowerCase();
    const paidUrl = params.has('gclid') || params.has('gbraid') || params.has('wbraid') ||
      ['cpc', 'ppc', 'paidsearch', 'paid_search'].includes(medium) ||
      /^(google_ads|googleads|adwords|google-cpc)$/.test(source);
    if (paidUrl) {
      try { sessionStorage.setItem(PAID_SESSION, '1'); } catch { /* storage unavailable */ }
    }
    const attribution = getStoredAttribution();
    const paidAttribution = Boolean(attribution.google_click_id || attribution.gbraid || attribution.wbraid ||
      ['cpc', 'ppc', 'paidsearch', 'paid_search'].includes((attribution.utm_medium || '').toLowerCase()) ||
      /^(google_ads|googleads|adwords|google-cpc)$/.test((attribution.utm_source || '').toLowerCase()));
    let paidSession = false;
    try { paidSession = sessionStorage.getItem(PAID_SESSION) === '1'; } catch { /* storage unavailable */ }
    const referrer = document.referrer.toLowerCase();
    const paidReferrer = /[?&](gclid|gbraid|wbraid)=/.test(referrer) || /[?&]utm_medium=(cpc|ppc)/.test(referrer);
    const currentCode = (useCartStore.getState().discountCode?.code || '').toUpperCase();
    const autoApplied = ['SAVE20', 'NEW20'].includes(currentCode);
    const excluded = route.pathname.startsWith('/google-ads-banner') ||
      route.pathname.startsWith('/admin') || route.pathname === '/checkout' ||
      paidUrl || paidAttribution || paidSession || paidReferrer || autoApplied;
    if (excluded) { setShowPopup(false); return; }
    try { if (Date.now() - Number(localStorage.getItem(KEY) || 0) < COOLDOWN_MS) return; } catch { /* storage unavailable */ }
    let fired = false;
    const show = () => {
      if (fired || ['SAVE20', 'NEW20'].includes((useCartStore.getState().discountCode?.code || '').toUpperCase())) return;
      fired = true;
      try { localStorage.setItem(KEY, String(Date.now())); } catch { /* storage unavailable */ }
      setShowPopup(true);
      gtag('event', 'popup_view', { popup_name: 'organic_first_order_25' });
    };
    const scroll = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      if (max > 0 && scrollY / max >= 0.5) show();
    };
    const timer = setTimeout(show, 35000);
    addEventListener('scroll', scroll, { passive: true });
    scroll();
    return () => { clearTimeout(timer); removeEventListener('scroll', scroll); };
  }, [route.pathname, route.search, discountCode]);
  return { showPopup, closePopup: () => setShowPopup(false) };
}
