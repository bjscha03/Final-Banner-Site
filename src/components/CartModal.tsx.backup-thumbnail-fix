import React from 'react';
import { X, Trash2, Plus, Minus, ShoppingBag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usd } from '@/lib/pricing';
import { useCartStore } from '@/store/cart';

interface CartModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CartModal: React.FC<CartModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { items, updateQuantity, removeItem, getSubtotalCents, getTaxCents, getTotalCents } = useCartStore();
  
  if (!isOpen) return null;

  const handleCheckout = () => {
    onClose();
    navigate('/checkout');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-sm">
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <ShoppingBag className="h-5 w-5 mr-2" /> Shopping Cart ({items.length})
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Items */}
          <div className="flex-1 overflow-y-auto p-6">
            {items.length === 0 ? (
              <div className="text-center py-12">
                <ShoppingBag className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Your cart is empty</p>
                <button onClick={onClose} className="mt-4 text-orange-500 hover:text-orange-600 font-medium">
                  Continue Shopping
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {items.map((item) => {
                  const eachCents = computeEach(item);
                  const ropeMode = item.rope_pricing_mode || 'per_item';
                  const pocketMode = item.pole_pocket_pricing_mode || 'per_item';
                  const ropeCost = item.rope_cost_cents || 0;
                  const pocketCost = item.pole_pocket_cost_cents || 0;
                  const ropeEach = item.quantity > 0 ? Math.round(ropeCost / item.quantity) : 0;
                  const pocketEach = item.quantity > 0 ? Math.round(pocketCost / item.quantity) : 0;

                  return (
                    <div key={item.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                      <div className="flex gap-3">
                        {/* Thumbnail */}
                        <div className="flex-shrink-0">
                          {item.file_url || item.aiDesign?.assets?.proofUrl ? (
                            <img
                              src={item.file_url || item.aiDesign?.assets?.proofUrl}
                              alt={`Banner ${item.width_in}x${item.height_in}`}
                              className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-lg border border-gray-200"
                              onError={(e) => {
                                // Fallback to placeholder if image fails to load
                                e.currentTarget.style.display = 'none';
                                const placeholder = e.currentTarget.nextElementSibling as HTMLElement;
                                if (placeholder) placeholder.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          <div 
                            className={`w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg border border-gray-200 flex items-center justify-center ${item.file_url || item.aiDesign?.assets?.proofUrl ? 'hidden' : 'flex'}`}
                          >
                            <div className="text-center">
                              <div className="text-xs font-medium text-gray-600">{item.width_in}"</div>
                              <div className="text-xs text-gray-400">×</div>
                              <div className="text-xs font-medium text-gray-600">{item.height_in}"</div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h3 className="font-semibold text-gray-900">Custom Banner {item.width_in}" × {item.height_in}"</h3>
                              <div className="text-xs text-gray-500 space-y-1 mt-1">
                                <div>Material: {item.material}</div>
                                {item.grommets && item.grommets !== 'none' && (<div>Grommets: {item.grommets}</div>)}
                                {ropeCost > 0 && (
                                  <div>
                                    Rope: {ropeMode === 'per_item' ? `${usd(ropeEach/100)} × ${item.quantity} = ${usd(ropeCost/100)}` : `${usd(ropeCost/100)}`}
                                  </div>
                                )}
                                {item.pole_pockets && item.pole_pockets !== 'none' && pocketCost > 0 && (
                                  <div>
                                    Pole pockets: {pocketMode === 'per_item' ? `${usd(pocketEach/100)} × ${item.quantity} = ${usd(pocketCost/100)}` : `${usd(pocketCost/100)}`}
                                  </div>
                                )}
                                {item.file_name && <div>File: {item.file_name}</div>}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-gray-900">{usd(item.line_total_cents/100)}</p>
                              <p className="text-xs text-gray-500">{usd(eachCents/100)} each</p>
                            </div>
                          </div>

                          {/* Quantity and remove */}
                          <div className="flex items-center justify-between mt-3">
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))} 
                                className="p-1.5 hover:bg-gray-100 rounded-md" 
                                disabled={item.quantity <= 1}
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="w-8 text-center font-medium">{item.quantity}</span>
                              <button 
                                onClick={() => updateQuantity(item.id, item.quantity + 1)} 
                                className="p-1.5 hover:bg-gray-100 rounded-md"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                            <button 
                              onClick={() => removeItem(item.id)} 
                              className="p-1.5 hover:bg-red-50 rounded-lg text-red-600"
                            >
                              <Trash2 className="h-4 w-4 inline mr-1" /> Remove
                            </button>
                          </div>

                          {/* Cost Breakdown card */}
                          <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                            <h4 className="text-sm font-medium text-gray-900 mb-2">Price Breakdown</h4>
                            <div className="space-y-1 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Base banner:</span>
                                <span className="text-gray-900">{usd(item.unit_price_cents/100)} × {item.quantity}</span>
                              </div>
                              {ropeCost > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Rope{ropeMode==='per_item' && item.rope_feet ? ` (${item.rope_feet.toFixed(1)}ft)` : ''}:</span>
                                  <span className="text-gray-900">{ropeMode==='per_item' ? `${usd(ropeEach/100)} × ${item.quantity} = ${usd(ropeCost/100)}` : `${usd(ropeCost/100)}`}</span>
                                </div>
                              )}
                              {pocketCost > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Pole pockets:</span>
                                  <span className="text-gray-900">{pocketMode==='per_item' ? `${usd(pocketEach/100)} × ${item.quantity} = ${usd(pocketCost/100)}` : `${usd(pocketCost/100)}`}</span>
                                </div>
                              )}
                              <div className="flex justify-between font-medium border-t border-gray-200 pt-1 mt-2">
                                <span className="text-gray-900">Line total:</span>
                                <span className="text-gray-900">{usd(item.line_total_cents/100)}</span>
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
            <div className="border-t p-6 space-y-2">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>{usd(subtotalCents/100)}</span>
              </div>
              <div className="flex justify-between text-green-600 font-medium">
                <span>Shipping:</span>
                <span>FREE</span>
              </div>
              <div className="flex justify-between">
                <span>Tax (6%):</span>
                <span>{usd(taxCents/100)}</span>
              </div>
              <div className="flex justify-between font-semibold text-lg border-t pt-2">
                <span>Total:</span>
                <span>{usd(totalCents/100)}</span>
              </div>

              <button onClick={handleCheckout} className="w-full mt-4 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white py-4 rounded-lg font-semibold text-lg shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-200">
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
