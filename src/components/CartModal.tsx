import React from 'react';
import { X, Trash2, Plus, Minus, ShoppingBag, Package, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCartStore } from '@/store/cart';
import { formatMoney, type CartItem, type CartTotals } from '@/lib/cart-pricing';

interface CartModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CartModal: React.FC<CartModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { cart, updateQuantity, removeItem, getTotals } = useCartStore();
  
  // Get computed totals using single source of truth
  const totals: CartTotals = getTotals() || { itemTotals: [], subtotalCents: 0, discountsCents: 0, subtotalAfterDiscountsCents: 0, taxCents: 0, shippingCents: 0, totalCents: 0 };
  
  const handleCheckout = () => {
    onClose();
    navigate('/checkout');
  };

  if (!isOpen) return null;

  // Safety checks for undefined arrays
  const items = cart?.items || [];
  const itemTotals = totals?.itemTotals || [];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
      
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-xl">
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <div className="flex items-center space-x-2">
              <ShoppingBag className="h-5 w-5 text-gray-600" />
              <h2 className="text-lg font-semibold text-gray-900">
                Shopping Cart ({items.reduce((sum, item) => sum + (item.qty || 0), 0)})
              </h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-1 text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <Package className="h-12 w-12 text-gray-300 mb-4" />
                <p className="text-gray-500 text-lg font-medium mb-2">Your cart is empty</p>
                <p className="text-gray-400 text-sm">Add some banners to get started!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {items.map((item, index) => {
                  // Get the computed totals for this specific item
                  const itemTotal = itemTotals.find(t => t.itemId === item.id);
                  if (!itemTotal) return null;

                  const options = item.options || [];

                  return (
                    <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        {/* Item Image Placeholder */}
                        <div className="flex-shrink-0">
                          <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center">
                            <FileText className="h-8 w-8 text-gray-400" />
                          </div>
                        </div>

                        {/* Item Details */}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-gray-900 mb-1">
                            {item.title || 'Custom Banner'}
                          </h3>
                          
                          {/* Item Options */}
                          {options.length > 0 && (
                            <div className="space-y-1 text-xs text-gray-600 mb-3">
                              {options.map(option => (
                                <div key={option.id} className="flex justify-between">
                                  <span>• {option.name}</span>
                                  <span>
                                    {option.pricingMode === 'per_item' 
                                      ? `${formatMoney(option.priceCents)} × ${item.qty} = ${formatMoney(option.priceCents * item.qty)}`
                                      : `${formatMoney(option.priceCents)} (per order)`
                                    }
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Price Breakdown */}
                          <div className="space-y-1 text-xs text-gray-600 mb-3">
                            <div className="flex justify-between">
                              <span>Base banner:</span>
                              <span>{formatMoney(item.unitPriceCents)} × {item.qty} = {formatMoney(item.unitPriceCents * item.qty)}</span>
                            </div>
                            {options.filter(o => o.pricingMode === 'per_item').map(option => (
                              <div key={option.id} className="flex justify-between">
                                <span>{option.name}:</span>
                                <span>{formatMoney(option.priceCents)} × {item.qty} = {formatMoney(option.priceCents * item.qty)}</span>
                              </div>
                            ))}
                            {options.filter(o => o.pricingMode === 'per_order').map(option => (
                              <div key={option.id} className="flex justify-between">
                                <span>{option.name}:</span>
                                <span>{formatMoney(option.priceCents)}</span>
                              </div>
                            ))}
                          </div>

                          {/* Quantity Controls */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => updateQuantity(item.id, item.qty - 1)}
                                className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="w-8 text-center text-sm font-medium">{item.qty}</span>
                              <button
                                onClick={() => updateQuantity(item.id, item.qty + 1)}
                                className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-gray-900 text-sm">
                                {formatMoney(itemTotal.lineTotalCents)}
                              </p>
                              <p className="text-xs text-gray-500">
                                {formatMoney(itemTotal.unitEachCents)} each
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Remove Button */}
                        <button
                          onClick={() => removeItem(item.id)}
                          className="flex-shrink-0 p-1 text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer with Totals */}
          {items.length > 0 && (
            <div className="border-t border-gray-200 px-4 py-4 space-y-3">
              {/* Subtotal */}
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-medium">{formatMoney(totals?.subtotalCents || 0)}</span>
              </div>

              {/* Discounts */}
              {(totals?.discountsCents || 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Discounts:</span>
                  <span className="font-medium text-green-600">-{formatMoney(totals.discountsCents)}</span>
                </div>
              )}

              {/* Shipping */}
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Shipping:</span>
                <span className="font-medium text-green-600">
                  {(totals?.shippingCents || 0) === 0 ? 'FREE' : formatMoney(totals.shippingCents)}
                </span>
              </div>

              {/* Tax */}
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Tax ({cart?.taxRatePct || 6}%):</span>
                <span className="font-medium">{formatMoney(totals?.taxCents || 0)}</span>
              </div>

              {/* Total */}
              <div className="flex justify-between text-lg font-bold border-t border-gray-200 pt-3">
                <span>Total:</span>
                <span>{formatMoney(totals?.totalCents || 0)}</span>
              </div>

              {/* Checkout Button */}
              <button
                onClick={handleCheckout}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
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
