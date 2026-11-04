import { useEffect, useState } from 'react';
import { gtag } from '@/lib/analytics';
const KEY = 'bof_email_popup_last_shown';
export function usePromoPopup() {
  const [showPopup, setShowPopup] = useState(false);
  useEffect(() => {
    if (location.pathname.startsWith('/admin') || location.pathname === '/checkout') return;
    try { if (Date.now() - Number(localStorage.getItem(KEY) || 0) < 30 * 86400000) return; } catch { /* storage unavailable */ }
    let fired = false;
    const show = () => {
      if (fired) return;
      fired = true;
      try { localStorage.setItem(KEY, String(Date.now())); } catch { /* storage unavailable */ }
      setShowPopup(true);
      gtag('event', 'popup_view', { popup_name: 'first_order_email' });
    };
    const scroll = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      if (max > 0 && scrollY / max >= 0.5) show();
    };
    const timer = setTimeout(show, 35000);
    addEventListener('scroll', scroll, { passive: true });
    scroll();
    return () => { clearTimeout(timer); removeEventListener('scroll', scroll); };
  }, []);
  return { showPopup, closePopup: () => setShowPopup(false) };
}
