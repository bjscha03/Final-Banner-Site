import React from 'react';
import { Lock } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useCartStore } from '@/store/cart';
import { useUIStore } from '@/store/ui';
import Header from './Header';
import '@/styles/bof-fresh.css';
import Footer from './Footer';
import CartModal from './CartModal';
import ScrollToTop from './ScrollToTop';
import PromoBanner from './PromoBanner';
import ScrollToTopLink from './ScrollToTopLink';
const SiteIssueAlert = React.lazy(() => import('./admin/SiteIssueAlert'));

interface LayoutProps {
  children: React.ReactNode;
  showFooterBanner?: boolean;
  checkoutMode?: boolean;
  compactMobileHeader?: boolean;
}

const Layout: React.FC<LayoutProps> = ({ children, checkoutMode = false, compactMobileHeader = false }) => {
  const location = useLocation();
  const isHomepage = location.pathname === '/';
  const isStorefront = !location.pathname.startsWith('/admin') && !location.pathname.startsWith('/daniel');
  const route = location.pathname + location.search;
  const theme = /feather|flag/.test(route) ? 'flag' : /yard/.test(route) ? 'yard' : /magnet/.test(route) ? 'magnet' : /products/.test(route) ? 'display' : 'banner';
  const isCheckout = checkoutMode || location.pathname === '/checkout';
  const { getItemCount } = useCartStore();
  const { isCartOpen, setIsCartOpen } = useUIStore();
  const [hasMounted, setHasMounted] = React.useState(false);
  const openCart = React.useCallback(() => setIsCartOpen(true), [setIsCartOpen]);
  const closeCart = React.useCallback(() => setIsCartOpen(false), [setIsCartOpen]);

  React.useEffect(() => setHasMounted(true), []);

  return (
    <div className={`brand-page max-w-[100vw] overflow-x-clip ${isStorefront ? 'bof-storefront' : ''}`} data-product-theme={theme}>
      <ScrollToTop />
      {!isCheckout && !location.pathname.startsWith('/admin') && <PromoBanner showStandardPromo={isHomepage} />}
      {isCheckout ? <header data-site-header data-checkout-header className="checkout-simple-header">
        <div><img src="/images/header-logo.png" alt="Banners On The Fly" width="248" height="70" /><span><Lock aria-hidden="true" />Secure checkout</span></div>
      </header> : <Header compactMobile={compactMobileHeader} cartCount={hasMounted ? getItemCount() : 0} onCartClick={openCart} />}
      <main className="w-full max-w-[100vw] overflow-x-clip">
        {location.pathname.startsWith('/admin') && location.pathname !== '/admin/setup' && location.pathname !== '/admin/site-issues' && <React.Suspense fallback={null}><SiteIssueAlert /></React.Suspense>}
        {children}
      </main>

      {isCheckout ? (
        <footer className="checkout-simple-footer">
          <Lock aria-hidden="true" /><span>Encrypted payment</span><span>·</span>
          <ScrollToTopLink to="/terms">Terms</ScrollToTopLink><span>·</span>
          <ScrollToTopLink to="/privacy">Privacy</ScrollToTopLink><span>·</span>
          <a href="mailto:support@bannersonthefly.com">Checkout help</a>
        </footer>
      ) : (
        <Footer />
      )}
      <CartModal
        isOpen={isCartOpen}
        onClose={closeCart}
      />
    </div>
  );
};

export default Layout;
