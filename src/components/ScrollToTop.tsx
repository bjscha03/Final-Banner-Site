import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Forces scroll to top with multiple strategies for cross-browser compatibility
 * Particularly important for iOS Safari and Android Chrome
 */
function forceScrollToTop() {
  try { 
    // Disable automatic scroll restoration temporarily
    window.history.scrollRestoration = 'manual'; 
  } catch (e) {
    // Ignore if not supported
  }
  
  // Multiple strategies for Safari/iOS compatibility
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  
  // Run again next frame to defeat late autofocus/layout shifts
  requestAnimationFrame(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    
    // Re-enable automatic scroll restoration for back/forward navigation
    try { 
      window.history.scrollRestoration = 'auto'; 
    } catch (e) {
      // Ignore if not supported
    }
  });
}

/**
 * Global scroll manager component that ensures all route changes land at page top
 * while preserving anchor link functionality and accessibility standards
 */
export default function ScrollToTop() {
  const location = useLocation();
  const lastPath = useRef<string>('');

  useEffect(() => {
    const currentPath = `${location.pathname}${location.search}`;
    
    // Skip if we're on the same path (prevents unnecessary scrolling)
    if (currentPath === lastPath.current) return;
    lastPath.current = currentPath;

    // Skip scroll-to-top when navigating to in-page anchor
    const hasHash = window.location.hash.length > 1;
    if (!hasHash) {
      forceScrollToTop();
    }
  }, [location]);

  return null;
}

/**
 * Hook for explicit scroll control in components
 * Use this for critical navigation points like Buy Now buttons
 */
export function useScrollToTop() {
  return {
    scrollToTop: forceScrollToTop,
    scrollToTopBeforeNavigate: () => {
      // Pre-scroll before navigation to prevent flash
      window.scrollTo(0, 0);
    }
  };
}

/**
 * Higher-order component that ensures a page always starts at the top
 * Use for critical pages like Sign-In, Checkout, Order Confirmation
 */
export function withScrollToTop<P extends object>(
  Component: React.ComponentType<P>,
  options: { focusTitle?: boolean } = {}
) {
  return function ScrollToTopWrapper(props: P) {
    const titleRef = useRef<HTMLHeadingElement>(null);

    useEffect(() => {
      forceScrollToTop();
      
      if (options.focusTitle && titleRef.current) {
        // Focus title for accessibility and to prevent mobile offset retention
        setTimeout(() => {
          titleRef.current?.focus();
        }, 100);
      }
    }, []);

    return <Component {...props} titleRef={titleRef} />;
  };
}
