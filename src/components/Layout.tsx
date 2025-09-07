import React, { useState } from 'react';
import { useCartStore } from '@/store/cart';
import Header from './Header';
import Footer from './Footer';
import CartModal from './CartModal';
import ScrollToTop from './ScrollToTop';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { items, updateQuantity, removeItem, getItemCount } = useCartStore();
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Convert cart items to the format expected by CartModal
  const cartItems = items.map(item => ({
    id: item.id,
    name: `Custom Banner ${item.width_in}" × ${item.height_in}"`,
    size: `${item.width_in}" × ${item.height_in}"`,
    material: item.material,
    quantity: item.quantity,
    price: item.unit_price_cents / 100,
    thumbnail: item.file_url,
    grommets: item.grommets,
    pole_pockets: item.pole_pockets,
    rope_feet: item.rope_feet,
    file_name: item.file_name
  }));

  const handleUpdateQuantity = (id: string, quantity: number) => {
    updateQuantity(id, quantity);
  };

  const handleRemoveItem = (id: string) => {
    removeItem(id);
  };

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
        items={cartItems}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
      />
    </div>
  );
};

export default Layout;
