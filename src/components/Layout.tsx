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
  const cartItems = items.map(item => {
    // Generate persistent thumbnail URL using file_key instead of temporary blob URL
    const thumbnailUrl = item.file_key
      ? `/.netlify/functions/download-file?fileKey=${encodeURIComponent(item.file_key)}`
      : item.file_url; // Fallback to original URL if no file_key

    return {
      id: item.id,
      name: `Custom Banner ${item.width_in}" × ${item.height_in}"`,
      size: `${item.width_in}" × ${item.height_in}"`,
      material: item.material,
      quantity: item.quantity,
      unit_price_cents: item.unit_price_cents,
      line_total_cents: item.line_total_cents,
      thumbnail: thumbnailUrl,
      grommets: item.grommets,
      pole_pockets: item.pole_pockets,
      rope_feet: item.rope_feet,
      pole_pocket_cost_cents: item.pole_pocket_cost_cents,      file_name: item.file_name,
      isPdf: item.file_name?.toLowerCase().endsWith('.pdf') || false
    };
  });

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
