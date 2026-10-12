import React from 'react';
import { useLocation } from 'react-router-dom';
import { LockKeyhole } from 'lucide-react';
import { useCartStore } from '@/store/cart';
import { useUIStore } from '@/store/ui';
import Header from './Header';
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
}

const Layout: React.FC<LayoutProps> = ({ children, checkoutMode = false }) => {
  const location = useLocation();
  const isHomepage = location.pathname === '/';
  const isCheckout = checkoutMode || location.pathname === '/checkout';
  const { getItemCount } = useCartStore();
  const { isCartOpen, setIsCartOpen } = useUIStore();
  const [hasMounted, setHasMounted] = React.useState(false);
  const openCart = React.useCallback(() => setIsCartOpen(true), [setIsCartOpen]);
  const closeCart = React.useCallback(() => setIsCartOpen(false), [setIsCartOpen]);

  React.useEffect(() => setHasMounted(true), []);

  return (
    <div className="brand-page max-w-[100vw] overflow-x-clip">
      <ScrollToTop />
      {!location.pathname.startsWith('/admin') && <PromoBanner showStandardPromo={isHomepage} />}
      {isCheckout ? (
        <header data-checkout-header className="border-b-2 border-[#FF6A00] bg-[#061A31] px-4 py-3 text-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
            <img src="/images/homepage/header-logo-reverse.png" alt="Banners On The Fly" width="248" height="80" className="h-auto w-36 sm:w-44" />
            <span className="flex items-center gap-2 text-xs font-semibold sm:text-sm"><LockKeyhole className="h-4 w-4 text-[#FF8A3D]" aria-hidden="true" />Secure checkout</span>
          </div>
        </header>
      ) : (
        <Header cartCount={hasMounted ? getItemCount() : 0} onCartClick={openCart} />
      )}
      <main className="w-full max-w-[100vw] overflow-x-clip">
        {location.pathname.startsWith('/admin') && location.pathname !== '/admin/setup' && location.pathname !== '/admin/site-issues' && <React.Suspense fallback={null}><SiteIssueAlert /></React.Suspense>}
        {children}
      </main>

      {isCheckout ? (
        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-center text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:text-left lg:px-8">
            <p>Secure encrypted checkout · Nationwide U.S. delivery</p>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:justify-end">
              <a href="mailto:support@bannersonthefly.com" className="font-semibold text-[#18448D] hover:underline">
                Checkout help
              </a>
              <ScrollToTopLink to="/terms" className="hover:text-[#18448D] hover:underline">Terms</ScrollToTopLink>
              <ScrollToTopLink to="/privacy" className="hover:text-[#18448D] hover:underline">Privacy</ScrollToTopLink>
            </div>
          </div>
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
