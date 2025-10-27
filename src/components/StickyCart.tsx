import React, { useState, useEffect, useRef } from 'react';
import { ShoppingCart, X, ChevronUp, ChevronDown, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCartStore } from '@/store/cart';
import { usd } from '@/lib/pricing';

interface StickyCartProps {
  onOpenCart: () => void;
  isCartOpen?: boolean;
}

const StickyCart: React.FC<StickyCartProps> = ({ onOpenCart, isCartOpen = false }) => {
  const navigate = useNavigate();
  const { items, getItemCount, getTotalCents } = useCartStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [isMinimized, setIsMinimized] = useState(() => {
    const saved = localStorage.getItem('sticky-cart-minimized');
    return saved !== 'false';
  });
  const [justAdded, setJustAdded] = useState(false);
  const [prevItemCount, setPrevItemCount] = useState(0);
  const lastScrollY = useRef(0);
  const scrollTimeout = useRef<NodeJS.Timeout>();

  const itemCount = getItemCount();
  const totalCents = getTotalCents();

  useEffect(() => {
  // Track item count changes for animation only - NO AUTO-EXPAND
    if (itemCount > prevItemCount && prevItemCount > 0) {
      setJustAdded(true);
      // Removed auto-expand - user must click to expand
      setTimeout(() => setJustAdded(false), 1000);
    }
    setPrevItemCount(itemCount);
  }, [itemCount, prevItemCount]);

  useEffect(() => {
    if (window.innerWidth < 768) return;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      if (scrollTimeout.current) {
        clearTimeout(scrollTimeout.current);
      }

      if (currentScrollY > lastScrollY.current && currentScrollY > 100) {
        setIsVisible(false);
      } else {
        setIsVisible(true);
      }

      lastScrollY.current = currentScrollY;

      scrollTimeout.current = setTimeout(() => {
        setIsVisible(true);
      }, 150);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeout.current) {
        clearTimeout(scrollTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('sticky-cart-minimized', isMinimized.toString());
  }, [isMinimized]);

  if (itemCount === 0 && isMinimized) {
    return null;
  }

  // Hide sticky cart when cart modal is open to prevent overlap/confusion
  if (isCartOpen) {
    return null;
  }


  const handleCheckout = () => {
    navigate('/checkout');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleMinimize = () => {
    setIsMinimized(!isMinimized);
    setIsExpanded(false);
  };

  if (window.innerWidth < 768) {
    return (
      <>
        <div
          className={`fixed bottom-20 right-4 z-40 transition-all duration-300 ${
            isVisible ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'
          } ${justAdded ? 'animate-bounce-subtle' : ''}`}
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <button
            onClick={onOpenCart}
            className="relative bg-white hover:from-blue-700 hover:to-indigo-700 text-slate-900 rounded-full p-4 shadow-sm transition-all duration-300 hover:scale-110 active:scale-95"
            aria-label={`Shopping cart with ${itemCount} items`}
          >
            <ShoppingCart className="h-6 w-6" />
            {itemCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-orange-500 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center shadow-sm animate-pulse">
                {itemCount}
              </span>
            )}
          </button>
        </div>

        {isExpanded && itemCount > 0 && (
          <div
            className="fixed bottom-32 right-4 z-40 bg-white rounded-lg shadow-sm border border-gray-200 w-72 animate-slide-in overflow-hidden"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="bg-white text-slate-900 p-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-2">
                  <ShoppingCart className="h-4 w-4" />
                  <h3 className="font-semibold text-sm">Shopping Cart</h3>
                </div>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                  aria-label="Close preview"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="p-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 text-sm">Items in cart:</span>
                  <span className="font-semibold text-gray-900">{itemCount}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 text-sm">Total:</span>
                  <span className="font-bold text-xl text-gray-900">{usd(totalCents / 100)}</span>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                <button
                  onClick={onOpenCart}
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-900 py-2 rounded-xl font-medium transition-colors text-sm"
                >
                  View Cart
                </button>
                <button
                  onClick={handleCheckout}
                  className="w-full bg-white hover:from-blue-700 hover:to-indigo-700 text-slate-900 py-2 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center space-x-2 shadow-sm hover:shadow-sm text-sm"
                >
                  <span>Checkout</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
</>
    );
  }

  if (isMinimized) {
    return (
      <div
        className={`hidden md:block fixed bottom-24 right-8 z-40 transition-all duration-300 ${
          isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
        }`}
      >
        <button
          onClick={handleToggleMinimize}
          className="relative bg-white hover:from-blue-700 hover:to-indigo-700 text-slate-900 rounded-full p-3 shadow-sm transition-all duration-300 hover:scale-110"
          aria-label={`Show cart with ${itemCount} items`}
        >
          <ShoppingCart className="h-5 w-5" />
          {itemCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-orange-500 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center shadow-sm">
              {itemCount}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      className={`hidden md:block fixed bottom-24 right-8 z-40 transition-all duration-300 ${
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      } ${justAdded ? 'scale-105' : 'scale-100'}`}
    >
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 w-80 overflow-hidden">
        <div className="bg-white text-slate-900 p-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <ShoppingCart className="h-5 w-5" />
              <h3 className="font-semibold">Shopping Cart</h3>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                aria-label={isExpanded ? 'Collapse cart' : 'Expand cart'}
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </button>
              <button
                onClick={handleToggleMinimize}
                className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                aria-label="Minimize cart"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="p-4">
          {itemCount === 0 ? (
            <div className="text-center py-6">
              <ShoppingCart className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Your cart is empty</p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 text-sm">Items in cart:</span>
                  <span className="font-semibold text-gray-900">{itemCount}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 text-sm">Total:</span>
                  <span className="font-bold text-xl text-gray-900">{usd(totalCents / 100)}</span>
                </div>
              </div>

              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-gray-200 space-y-2 max-h-48 overflow-y-auto">
                  {items.slice(0, 3).map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="text-gray-600 truncate flex-1">
                        {item.width_in}" × {item.height_in}" {item.material}
                      </span>
                      <span className="font-medium text-gray-900 ml-2">
                        {usd(item.line_total_cents / 100)}
                      </span>
                    </div>
                  ))}
                  {items.length > 3 && (
                    <p className="text-xs text-gray-500 text-center pt-2">
                      +{items.length - 3} more item{items.length - 3 !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              )}

              <div className="mt-4 space-y-2">
                <button
                  onClick={onOpenCart}
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-900 py-2 rounded-xl font-medium transition-colors"
                >
                  View Cart
                </button>
                <button
                  onClick={handleCheckout}
                  className="w-full bg-white hover:from-blue-700 hover:to-indigo-700 text-slate-900 py-2 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center space-x-2 shadow-sm hover:shadow-sm"
                >
                  <span>Checkout</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default StickyCart;
