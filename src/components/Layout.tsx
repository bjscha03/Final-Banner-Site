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

interface LayoutProps {
  children: React.ReactNode;
  showFooterBanner?: boolean;
  checkoutMode?: boolean;
}

const Layout: React.FC<LayoutProps> = ({ children, checkoutMode = false }) => {
  const location = useLocation();
  const isHomepage = location.pathname === '/';
  const { getItemCount } = useCartStore();
  const { isCartOpen, setIsCartOpen } = useUIStore();
  const [hasMounted, setHasMounted] = React.useState(false);
  const openCart = React.useCallback(() => setIsCartOpen(true), [setIsCartOpen]);
  const closeCart = React.useCallback(() => setIsCartOpen(false), [setIsCartOpen]);

  React.useEffect(() => setHasMounted(true), []);

  return (
    <div className="brand-page max-w-[100vw] overflow-x-clip">
      <ScrollToTop />
      {isHomepage && <PromoBanner />}
      {checkoutMode ? (
        <header data-checkout-header className="border-b border-white/10 bg-[#061A31] text-white shadow-[0_8px_24px_rgba(6,26,49,0.16)]">
          <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <ScrollToTopLink to="/" aria-label="Banners On The Fly home" className="flex items-center">
              <img
                src="/images/homepage/header-logo-reverse.png"
                alt="Banners On The Fly"
                width="248"
                height="70"
                className="h-10 w-auto max-w-[205px] object-contain sm:h-11 sm:max-w-[240px]"
              />
            </ScrollToTopLink>
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-white/90">
              <LockKeyhole className="h-4 w-4 text-[#FF8A3D]" aria-hidden="true" />
              <span>Secure checkout</span>
            </div>
          </div>
        </header>
      ) : (
        <Header
          cartCount={hasMounted ? getItemCount() : 0}
          onCartClick={openCart}
        />
      )}
      <main className="w-full max-w-[100vw] overflow-x-clip">
        {children}
      </main>

      {checkoutMode ? (
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
      {!checkoutMode ? (
        <CartModal
          isOpen={isCartOpen}
          onClose={closeCart}
        />
      ) : null}
    </div>
  );
};

export default Layout;
