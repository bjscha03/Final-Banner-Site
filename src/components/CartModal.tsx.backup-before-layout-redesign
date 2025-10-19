import React from 'react';
import { X, Trash2, Plus, Minus, ShoppingBag, Edit } from 'lucide-react';
import BannerPreview from './cart/BannerPreview';
import { useNavigate } from 'react-router-dom';
import { usd } from '@/lib/pricing';
import { useCartStore } from '@/store/cart';
import { useToast } from '@/hooks/use-toast';
import { useQuoteStore } from '@/store/quote';

interface CartModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CartModal: React.FC<CartModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { items, updateQuantity, removeItem, loadItemIntoQuote, getSubtotalCents, getTaxCents, getTotalCents } = useCartStore();
  const { toast } = useToast();
  const { loadFromCartItem } = useQuoteStore();
  
  if (!isOpen) return null;

  const handleCheckout = () => {
    onClose();
    navigate('/checkout');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleEdit = (itemId: string) => {
    console.log('🛒 CART MODAL: handleEdit called with itemId:', itemId);
    
    try {
      const item = loadItemIntoQuote(itemId);
      console.log('�� CART MODAL: loadItemIntoQuote returned:', item);
      
      if (!item) {
        console.error('❌ CART MODAL: Item not found in cart:', itemId);
        toast({
          title: "Error",
          description: "Could not find the item to edit.",
          variant: "destructive",
        });
        return;
      }

      // CRITICAL FIX: Pass editingItemId to loadFromCartItem
      // This ensures it's set atomically with all other state in a single update
      console.log('🛒 CART MODAL: Loading item into quote store with editingItemId:', itemId);
      loadFromCartItem(item, itemId);
      console.log('🛒 CART MODAL: item.overlay_image:', item.overlay_image);
      
      // Close modal
      console.log('🛒 CART MODAL: Closing modal and navigating to /design');
      onClose();
      
      // Navigate to design page
      navigate('/design');
      
      // Scroll to top
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        console.log('✅ CART MODAL: Navigation complete, editingItemId should be set');
      }, 100);
      
    } catch (error) {
      console.error('❌ CART MODAL: Error in handleEdit:', error);
      toast({
        title: "Error",
        description: "Failed to load item for editing. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Compute "each" price
  const computeEach = (item: any): number => {
    const ropeMode = item.rope_pricing_mode || 'per_item';
    const pocketMode = item.pole_pocket_pricing_mode || 'per_item';
    const ropeCost = item.rope_cost_cents || 0;
    const pocketCost = item.pole_pocket_cost_cents || 0;
    
    // Subtract per-order costs from line total, then divide by quantity
    const perOrderCosts = (ropeMode === 'per_order' ? ropeCost : 0) + (pocketMode === 'per_order' ? pocketCost : 0);
    const each = Math.round((item.line_total_cents - perOrderCosts) / Math.max(1, item.quantity));
    return each;
  };

  // Use cart store methods which include migration logic
  const subtotalCents = getSubtotalCents();
  const taxCents = getTaxCents();
  const totalCents = getTotalCents();

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-xl">
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-white">
            <h2 className="text-xl font-bold text-gray-900 flex items-center">
              <ShoppingBag className="h-6 w-6 mr-2 text-[#18448D]" /> Shopping Cart ({items.length})
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="h-6 w-6 text-gray-600" />
            </button>
          </div>

          {/* Items */}
          <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
            {items.length === 0 ? (
              <div className="text-center py-12">
                <ShoppingBag className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 text-lg mb-2">Your cart is empty</p>
                <p className="text-gray-500 text-sm mb-6">Add some banners to get started!</p>
                <button 
                  onClick={onClose} 
                  className="bg-[#ff6b35] hover:bg-[#e16629] text-white px-6 py-3 rounded-lg font-semibold transition-colors shadow-md hover:shadow-lg"
                >
                  Continue Shopping
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {items.map((item) => {
                  const eachCents = computeEach(item);
                  const ropeCost = item.rope_cost_cents || 0;
                  const pocketCost = item.pole_pocket_cost_cents || 0;

                  return (
                    <div key={item.id} className="bg-white rounded-xl p-4 shadow-lg border border-gray-200 hover:shadow-xl transition-shadow">
                      <div className="flex gap-4">
                        {/* Thumbnail */}
                        <BannerPreview
                          key={`thumbnail-${item.id}-${item.text_elements?.length || 0}-${item.image_scale || 1}`}
                          widthIn={item.width_in}
                          heightIn={item.height_in}
                          grommets={item.grommets}
                          imageUrl={item.file_url || item.web_preview_url || item.print_ready_url}
                          material={item.material}
                          textElements={item.text_elements}
                          overlayImage={item.overlay_image}
                          imageScale={item.image_scale}
                          imagePosition={item.image_position}
                          className="flex-shrink-0"
                        />
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start mb-2 gap-2">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-bold text-gray-900 text-base">Custom Banner {item.width_in}" × {item.height_in}"</h3>
                              <div className="text-xs text-gray-600 space-y-0.5 mt-1.5">
                                <div className="font-medium">Material: <span className="text-gray-800">{item.material}</span></div>
                                {item.grommets && item.grommets !== 'none' && (
                                  <div>Grommets: <span className="text-gray-800">{item.grommets}</span></div>
                                )}
                                {ropeCost > 0 && item.rope_feet && (
                                  <div>Rope: <span className="text-gray-800">{item.rope_feet.toFixed(1)}ft</span></div>
                                )}
                                {item.pole_pockets && item.pole_pockets !== 'none' && (
                                  <div>Pole pockets: <span className="text-gray-800">{item.pole_pockets}</span></div>
                                )}
                                {item.file_name && <div className="truncate" title={item.file_name}>File: <span className="text-gray-800">{item.file_name}</span></div>}
                              </div>
                            </div>
                            <div className="text-right ml-3 flex-shrink-0">
                              <p className="font-bold text-[#18448D] text-lg whitespace-nowrap">{usd(item.line_total_cents/100)}</p>
                            </div>
                          </div>

                          {/* Quantity and Actions */}
                          <div className="flex items-center justify-between mt-3 gap-2 flex-wrap">
                            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                              <button 
                                onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))} 
                                className="p-1.5 hover:bg-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
                                disabled={item.quantity <= 1}
                                aria-label="Decrease quantity"
                              >
                                <Minus className="h-4 w-4 text-gray-700" />
                              </button>
                              <span className="w-10 text-center font-semibold text-gray-900">{item.quantity}</span>
                              <button 
                                onClick={() => updateQuantity(item.id, item.quantity + 1)} 
                                className="p-1.5 hover:bg-white rounded-md transition-colors"
                                aria-label="Increase quantity"
                              >
                                <Plus className="h-4 w-4 text-gray-700" />
                              </button>
                            </div>
                            
                            <div className="flex items-center gap-1.5">
                              <button 
                                onClick={() => handleEdit(item.id)} 
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-[#18448D] hover:bg-[#0f2d5c] text-white rounded-lg text-xs font-medium transition-colors shadow-sm hover:shadow-md"
                                aria-label="Edit banner"
                              >
                                <Edit className="h-3.5 w-3.5" />
                                <span>Edit</span>
                              </button>
                              <button 
                                onClick={() => removeItem(item.id)} 
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-medium transition-colors"
                                aria-label="Remove from cart"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>Remove</span>
                              </button>
                            </div>
                          </div>

                          {/* Cost Breakdown - SIMPLIFIED */}
                          <div className="mt-3 p-3 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border border-gray-200">
                            <h4 className="text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">Price Breakdown</h4>
                            <div className="space-y-1.5 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Base banner:</span>
                                <span className="text-gray-900 font-medium">{usd((item.unit_price_cents * item.quantity)/100)}</span>
                              </div>
                              {ropeCost > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Rope{item.rope_feet ? ` (${item.rope_feet.toFixed(1)}ft)` : ''}:</span>
                                  <span className="text-gray-900 font-medium">{usd(ropeCost/100)}</span>
                                </div>
                              )}
                              {pocketCost > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Pole pockets:</span>
                                  <span className="text-gray-900 font-medium">{usd(pocketCost/100)}</span>
                                </div>
                              )}
                              <div className="flex justify-between font-bold border-t border-gray-300 pt-2 mt-2">
                                <span className="text-gray-900">Line total:</span>
                                <span className="text-[#18448D]">{usd(item.line_total_cents/100)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {items.length > 0 && (
            <div className="border-t border-gray-200 p-6 space-y-3 bg-white shadow-lg">
              <div className="flex justify-between text-gray-700">
                <span className="font-medium">Subtotal:</span>
                <span className="font-semibold">{usd(subtotalCents/100)}</span>
              </div>
              <div className="flex justify-between text-green-600 font-semibold">
                <span>Shipping:</span>
                <span>FREE</span>
              </div>
              <div className="flex justify-between text-gray-700">
                <span className="font-medium">Tax (6%):</span>
                <span className="font-semibold">{usd(taxCents/100)}</span>
              </div>
              <div className="flex justify-between font-bold text-xl border-t border-gray-300 pt-3">
                <span className="text-gray-900">Total:</span>
                <span className="text-[#18448D]">{usd(totalCents/100)}</span>
              </div>

              <button 
                onClick={handleCheckout} 
                className="w-full mt-4 bg-[#ff6b35] hover:bg-[#e16629] text-white py-4 rounded-lg font-bold text-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02]"
              >
                Proceed to Checkout
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CartModal;
