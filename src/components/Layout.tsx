import React from 'react';
import { useCartStore } from '@/store/cart';
import { useUIStore } from '@/store/ui';
import Header from './Header';
import Footer from './Footer';
import CartModal from './CartModal';
import ScrollToTop from './ScrollToTop';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { getItemCount } = useCartStore();
  const { isCartOpen, setIsCartOpen } = useUIStore();

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
        <img
          src="https://res.cloudinary.com/dtrxl120u/image/upload/v1767723458/upscaled-2x-Screenshot_2025-10-07_at_2.29.47_PM_wegqxg_ubaxdz.png"
          alt="Banner printing services"
          className="w-full h-auto object-contain"
        />
      </div>

      <Footer />
      <CartModal
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
      />
    </div>
  );
};

export default Layout;
