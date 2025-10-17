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
      
      {/* Decorative Banner Image - Sits above footer */}
      <div className="w-full">
        <OptimizedImage 
          src="https://res.cloudinary.com/dtrxl120u/image/upload/v1759861799/Screenshot_2025-10-07_at_2.29.47_PM_wegqxg.png" width={1600} width={1600}
          alt="Banner printing services"
          className="w-full h-auto object-contain"
        />
      </div>
      
      <Footer />
      <CartModal
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
      />
      <StickyCart onOpenCart={() => setIsCartOpen(true)} isCartOpen={isCartOpen} />
    </div>
  );
};

export default Layout;
