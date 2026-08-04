import React from 'react';
import { useCartStore } from '@/store/cart';
import { useUIStore } from '@/store/ui';
import Header from './Header';
import Footer from './Footer';
import CartModal from './CartModal';
import ScrollToTop from './ScrollToTop';

interface LayoutProps {
  children: React.ReactNode;
  showFooterBanner?: boolean;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { getItemCount } = useCartStore();
  const { isCartOpen, setIsCartOpen } = useUIStore();
  const [hasMounted, setHasMounted] = React.useState(false);

  React.useEffect(() => setHasMounted(true), []);

  return (
    <div className="brand-page max-w-[100vw] overflow-x-hidden">
      <ScrollToTop />
      <Header
        cartCount={hasMounted ? getItemCount() : 0}
        onCartClick={() => setIsCartOpen(true)}
      />
      <main className="w-full max-w-[100vw] overflow-x-hidden">
        {children}
      </main>

      <Footer />
      <CartModal
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
      />
    </div>
  );
};

export default Layout;
