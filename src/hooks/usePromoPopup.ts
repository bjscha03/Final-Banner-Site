import { useState, useEffect } from 'react';

interface UsePromoPopupOptions {
  delaySeconds?: number; // Delay before showing popup (10-12 seconds)
  enableExitIntent?: boolean; // Show on exit intent (desktop only)
}

type PopupSource = 'first_visit' | 'exit_intent';

export const usePromoPopup = (options: UsePromoPopupOptions = {}) => {
  const { delaySeconds = 11, enableExitIntent = true } = options;
  const [showPopup, setShowPopup] = useState(false);
  const [popupSource, setPopupSource] = useState<PopupSource>('first_visit');
  const [hasShownPopup, setHasShownPopup] = useState(false);

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
      if (!hasShownPopup) {
        console.log('[usePromoPopup] Showing popup after delay');
        setPopupSource('first_visit');
        setShowPopup(true);
        setHasShownPopup(true);
      }
    }, delaySeconds * 1000);

    // Exit intent handler (desktop only)
    const handleMouseLeave = (e: MouseEvent) => {
      if (!enableExitIntent || hasShownPopup) return;
      
      // Only trigger if mouse is leaving from the top of the page
      if (e.clientY <= 0) {
        console.log('[usePromoPopup] Exit intent detected');
        setPopupSource('exit_intent');
        setShowPopup(true);
        setHasShownPopup(true);
      }
    };

    // Only add exit intent on desktop (screen width > 768px)
    if (enableExitIntent && window.innerWidth > 768) {
      document.addEventListener('mouseleave', handleMouseLeave);
    }

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [delaySeconds, enableExitIntent, hasShownPopup]);

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
