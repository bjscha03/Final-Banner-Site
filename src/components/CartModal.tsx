import React from 'react';
import { X, Trash2, Plus, Minus, ShoppingBag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usd } from '@/lib/pricing';
import { CartItem } from '@/store/cart';

interface CartModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQuantity: (id: string, quantity: number) => void;
  onRemoveItem: (id: string) => void;
}

const CartModal: React.FC<CartModalProps> = ({ isOpen, onClose, items, onUpdateQuantity, onRemoveItem }) => {
  const navigate = useNavigate();
  if (!isOpen) return null;

  const handleCheckout = () => {
    onClose();
    navigate('/checkout');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const computeEachFromStored = (item: CartItem): number => {
    const perOrder = (item.rope_pricing_mode === 'per_order' ? (item.rope_cost_cents || 0) : 0) +
                     (item.pole_pocket_pricing_mode === 'per_order' ? (item.pole_pocket_cost_cents || 0) : 0);
    const each = Math.round((item.line_total_cents - perOrder) / Math.max(1, item.quantity));
    return each;
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-xl">
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
                  const eachCents = computeEachFromStored(item);
                  const ropeMode = item.rope_pricing_mode || 'per_item';
                  const pocketMode = item.pole_pocket_pricing_mode || 'per_item';
                  const ropeTotal = item.rope_cost_cents || Math.round((item.rope_feet || 0) * 2 * item.quantity * 100);
                  const pocketTotal = item.pole_pocket_cost_cents || 0;
                  const ropeEach = Math.round(ropeTotal / Math.max(1, item.quantity));
                  const pocketEach = Math.round(pocketTotal / Math.max(1, item.quantity));

                  return (
                    <div key={item.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h3 className="font-semibold text-gray-900">Custom Banner {item.width_in}" × {item.height_in}"</h3>
                              <div className="text-xs text-gray-500 space-y-1 mt-1">
                                <div>Material: {item.material}</div>
                                {item.grommets && item.grommets !== 'none' && (<div>Grommets: {item.grommets}</div>)}
                                {ropeTotal > 0 && (
                                  <div>
                                    Rope: {ropeMode === 'per_item' ? `${usd(ropeEach/100)} × ${item.quantity} = ${usd(ropeTotal/100)}` : `${usd(ropeTotal/100)}`}
                                  </div>
                                )}
                                {item.pole_pockets && item.pole_pockets !== 'none' && pocketTotal > 0 && (
                                  <div>
                                    Pole pockets: {pocketMode === 'per_item' ? `${usd(pocketEach/100)} × ${item.quantity} = ${usd(pocketTotal/100)}` : `${usd(pocketTotal/100)}`}
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
                              <button onClick={() => onUpdateQuantity(item.id, Math.max(1, item.quantity - 1))} className="p-1.5 hover:bg-gray-100 rounded-md"><Minus className="h-3 w-3" /></button>
                              <span className="w-8 text-center font-medium">{item.quantity}</span>
                              <button onClick={() => onUpdateQuantity(item.id, item.quantity + 1)} className="p-1.5 hover:bg-gray-100 rounded-md"><Plus className="h-3 w-3" /></button>
                            </div>
                            <button onClick={() => onRemoveItem(item.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-600">
                              <Trash2 className="h-4 w-4 inline mr-1" /> Remove
                            </button>
                          </div>

                          {/* Cost Breakdown card */}
                          <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                            <h4 className="text-sm font-medium text-gray-900 mb-2">Price Breakdown</h4>
                            <div className="space-y-1 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Base banner:</span>
                                <span className="text-gray-900">{usd((item.unit_price_cents/100))} × {item.quantity}</span>
                              </div>
                              {ropeTotal > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Rope{ropeMode==='per_item' ? ` (${(item.rope_feet||0).toFixed(1)}ft)` : ''}:</span>
                                  <span className="text-gray-900">{ropeMode==='per_item' ? `${usd(ropeEach/100)} × ${item.quantity} = ${usd(ropeTotal/100)}` : `${usd(ropeTotal/100)}`}</span>
                                </div>
                              )}
                              {pocketTotal > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Pole pockets:</span>
                                  <span className="text-gray-900">{pocketMode==='per_item' ? `${usd(pocketEach/100)} × ${item.quantity} = ${usd(pocketTotal/100)}` : `${usd(pocketTotal/100)}`}</span>
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
                <span>{usd(items.reduce((s, it) => s + it.line_total_cents, 0)/100)}</span>
              </div>
              <div className="flex justify-between text-green-600 font-medium">
                <span>Shipping:</span>
                <span>FREE</span>
              </div>
              <div className="flex justify-between">
                <span>Tax (6%):</span>
                <span>{usd(Math.round((items.reduce((s, it) => s + it.line_total_cents, 0) * 0.06))/100)}</span>
              </div>
              <div className="flex justify-between font-semibold text-lg border-t pt-2">
                <span>Total:</span>
                <span>{usd(Math.round((items.reduce((s, it) => s + it.line_total_cents, 0) * 1.06))/100)}</span>
              </div>

              <button onClick={handleCheckout} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-4 rounded-2xl font-semibold text-lg shadow-lg hover:shadow-xl transition-all duration-200">
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
