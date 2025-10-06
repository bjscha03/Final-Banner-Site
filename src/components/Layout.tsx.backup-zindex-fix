import React, { useState } from 'react';
import { useCartStore } from '@/store/cart';
import Header from './Header';
import Footer from './Footer';
import CartModal from './CartModal';
import ScrollToTop from './ScrollToTop';
import StickyCart from './StickyCart';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { getItemCount } = useCartStore();
  const [isCartOpen, setIsCartOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white overflow-x-hidden max-w-[100vw]">
      <ScrollToTop />
      <Header
        cartCount={getItemCount()}
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
      <StickyCart onOpenCart={() => setIsCartOpen(true)} />
    </div>
  );
};

export default Layout;
