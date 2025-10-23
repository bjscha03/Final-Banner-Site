import { useState, useEffect } from 'react';

interface UsePromoPopupOptions {
  delaySeconds?: number; // Delay before showing popup (10-12 seconds)
  enableExitIntent?: boolean; // Show on exit intent (desktop only)
}

export const usePromoPopup = (options: UsePromoPopupOptions = {}) => {
  const { delaySeconds = 11, enableExitIntent = true } = options;
  const [showPopup, setShowPopup] = useState(false);
  const [hasShownPopup, setHasShownPopup] = useState(false);

  useEffect(() => {
    // Check if popup should be suppressed
    const dismissedAt = localStorage.getItem('promo_popup_dismissed');
    const codeUsed = localStorage.getItem('promo_code_used');
    
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

    if (codeUsed) {
      console.log('[usePromoPopup] Code already used, not showing popup');
      return;
    }

    // Timer-based display
    const timer = setTimeout(() => {
      if (!hasShownPopup) {
        console.log('[usePromoPopup] Showing popup after delay');
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
    setShowPopup(false);
  };

  const markCodeAsUsed = () => {
    localStorage.setItem('promo_code_used', 'true');
    setShowPopup(false);
  };

  return {
    showPopup,
    closePopup,
    markCodeAsUsed,
  };
};
