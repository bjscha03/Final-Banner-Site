import React from 'react';
import { useLocation } from 'react-router-dom';
import { useCartStore } from '@/store/cart';
import { useUIStore } from '@/store/ui';
import Header from './Header';
import Footer from './Footer';
import CartModal from './CartModal';
import ScrollToTop from './ScrollToTop';
import PromoBanner from './PromoBanner';

interface LayoutProps {
  children: React.ReactNode;
  showFooterBanner?: boolean;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
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
      <Header
        cartCount={hasMounted ? getItemCount() : 0}
        onCartClick={openCart}
      />
      <main className="w-full max-w-[100vw] overflow-x-clip">
        {children}
      </main>

      <Footer />
      <CartModal
        isOpen={isCartOpen}
        onClose={closeCart}
      />
    </div>
  );
};

export default Layout;
