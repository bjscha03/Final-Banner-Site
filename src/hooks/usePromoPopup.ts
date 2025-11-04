import { useState, useEffect } from 'react';

interface UsePromoPopupOptions {
  delaySeconds?: number; // Delay before showing popup (default: immediate)
  enableExitIntent?: boolean; // Show on exit intent (desktop only)
}

type PopupSource = 'first_visit' | 'exit_intent';

export const usePromoPopup = (options: UsePromoPopupOptions = {}) => {
  const { delaySeconds = 0, enableExitIntent = true } = options;
  const [showPopup, setShowPopup] = useState(false);
  const [popupSource, setPopupSource] = useState<PopupSource>('first_visit');
  const [hasShownInitialPopup, setHasShownInitialPopup] = useState(false);
  const [hasScrolledHalfway, setHasScrolledHalfway] = useState(false);

  useEffect(() => {
    // Check if user already received their code (permanent dismissal)
    // If user already got their code, NEVER show popup again
    if (localStorage.getItem('promo_code_received') === 'true') {
      console.log('[usePromoPopup] User already received code - popup permanently suppressed');
      return;
    }

    // Check for temporary dismissal (72-hour cooldown for X button clicks)
    const dismissedAt = localStorage.getItem('promo_popup_dismissed');
    
    if (dismissedAt) {
      const expiryDate = new Date(dismissedAt);
      if (expiryDate > new Date()) {
        console.log('[usePromoPopup] Popup suppressed until:', expiryDate);
        return;
      } else {
        // Expired, clear it
        localStorage.removeItem('promo_popup_dismissed');
      }
    }

    // Timer-based display (first visit)
    const timer = setTimeout(() => {
      if (!hasShownInitialPopup) {
        console.log('[usePromoPopup] Showing popup after delay');
        setPopupSource('first_visit');
        setShowPopup(true);
        setHasShownInitialPopup(true);
      }
    }, delaySeconds * 1000);

    // Exit intent handler (desktop only) - can re-trigger
    const handleMouseLeave = (e: MouseEvent) => {
      if (!enableExitIntent) return;
      
      // Only trigger if mouse is leaving from the top of the page (going to close tab)
      if (e.clientY <= 0) {
        console.log('[usePromoPopup] Exit intent detected - cursor to close tab');
        setPopupSource('exit_intent');
        setShowPopup(true);
      }
    };

    // Scroll handler - show when user scrolls 50% down
    const handleScroll = () => {
      if (hasScrolledHalfway) return;

      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const scrollPercent = (scrollTop / scrollHeight) * 100;

      if (scrollPercent >= 50) {
        console.log('[usePromoPopup] User scrolled 50% - showing exit intent popup');
        setHasScrolledHalfway(true);
        setPopupSource('exit_intent');
        setShowPopup(true);
      }
    };

    // Only add exit intent on desktop (screen width > 768px)
    if (enableExitIntent && window.innerWidth > 768) {
      document.addEventListener('mouseleave', handleMouseLeave);
    }

    // Add scroll listener
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [delaySeconds, enableExitIntent, hasShownInitialPopup, hasScrolledHalfway]);

  const closePopup = () => {
    // Set 72-hour cooldown
    const expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() + 72);
    localStorage.setItem('promo_popup_dismissed', expiryDate.toISOString());
    setShowPopup(false);
  };

  return {
    showPopup,
    popupSource,
    closePopup,
  };
};
