import React from 'react';
import { X, Trash2, Plus, Minus, ShoppingBag, Package, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCartStore } from '@/store/cart';

interface CartItem {
  id: string;
  name: string;
  size: string;
  material: string;
  quantity: number;
  price: number;
  thumbnail?: string;
  grommets?: string;
  pole_pockets?: string;
  rope_feet?: number;
  pole_pocket_cost_cents?: number;  file_name?: string;
  isPdf?: boolean;
}

interface CartModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQuantity: (id: string, quantity: number) => void;
  onRemoveItem: (id: string) => void;
}

const CartModal: React.FC<CartModalProps> = ({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onRemoveItem
}) => {
  const navigate = useNavigate();
  const { getSubtotalCents, getTaxCents, getTotalCents } = useCartStore();

  if (!isOpen) return null;

  const subtotalCents = getSubtotalCents();
  const taxCents = getTaxCents();
  const totalCents = getTotalCents();

  const handleCheckout = () => {
    onClose();
    navigate('/checkout');
    // Scroll to top of page
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
      
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-xl">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <ShoppingBag className="h-5 w-5 mr-2" />
              Shopping Cart ({items.length})
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto p-6">
            {items.length === 0 ? (
              <div className="text-center py-12">
                <ShoppingBag className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Your cart is empty</p>
                <button
                  onClick={onClose}
                  className="mt-4 text-orange-500 hover:text-orange-600 font-medium"
                >
                  Continue Shopping
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {items.map((item) => (
                  <div key={item.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <div className="flex gap-3">
                      {/* Thumbnail */}
                      <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                        {item.isPdf ? (
                          <div className="w-full h-full bg-gradient-to-br from-red-100 to-red-200 flex items-center justify-center">
                            <FileText className="h-6 w-6 text-red-600" />
                          </div>
                        ) : item.thumbnail ? (
                          <img
                            src={item.thumbnail}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center">
                            <Package className="h-6 w-6 text-blue-500" />
                          </div>
                        )}
                      </div>

                      {/* Item Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h3 className="font-semibold text-gray-900 text-sm">{item.name}</h3>
                            <p className="text-xs text-gray-500">{item.size} • {item.material}</p>

                            {/* Options Display */}
                            <div className="mt-1 space-y-1">
                              {item.grommets && item.grommets !== 'none' && (
                                <div className="inline-flex items-center bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full mr-1 mb-1">
                                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-1.5"></span>
                                  {item.grommets === 'every-2-3ft' ? 'Grommets: Every 2-3ft' :
                                   item.grommets === 'every-1-2ft' ? 'Grommets: Every 1-2ft' :
                                   item.grommets === '4-corners' ? 'Grommets: 4 corners' :
                                   item.grommets === 'top-corners' ? 'Grommets: Top corners' :
                                   item.grommets === 'right-corners' ? 'Grommets: Right corners' :
                                   item.grommets === 'left-corners' ? 'Grommets: Left corners' :
                                   `Grommets: ${item.grommets}`}
                                </div>
                              )}

                              {item.pole_pockets && item.pole_pockets !== 'none' && (
                                <div className="inline-flex items-center bg-green-50 text-green-700 text-xs px-2 py-0.5 rounded-full mr-1 mb-1">
                                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5"></span>
                                  Pole Pockets: {item.pole_pockets}
                                </div>
                              )}

                              {item.rope_feet && item.rope_feet > 0 && (
                                <div className="inline-flex items-center bg-orange-50 text-orange-700 text-xs px-2 py-0.5 rounded-full mr-1 mb-1">
                                  <span className="w-1.5 h-1.5 bg-orange-500 rounded-full mr-1.5"></span>
                                  Rope: {item.rope_feet}ft
                                </div>
                              )}

                              {item.file_name && (
                                <div className="inline-flex items-center bg-purple-50 text-purple-700 text-xs px-2 py-0.5 rounded-full mr-1 mb-1">
                                  <span className="w-1.5 h-1.5 bg-purple-500 rounded-full mr-1.5"></span>
                                  File: {item.file_name.length > 15 ? `${item.file_name.substring(0, 15)}...` : item.file_name}
                                </div>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => onRemoveItem(item.id)}
                            className="p-1.5 hover:bg-red-50 rounded-lg text-red-500 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Cost Breakdown */}
                        <div className="mt-2 p-2 bg-gray-50 rounded-lg text-xs">
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Base banner:</span>
                              <span className="text-gray-900">${(item.unit_price_cents / 100).toFixed(2)} × {item.quantity}</span>
                            </div>
                            {item.rope_feet && item.rope_feet > 0 && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">Rope ({item.rope_feet}ft):</span>
                                <span className="text-gray-900">${(item.rope_feet * 2).toFixed(2)}</span>
                              </div>
                            )}
                            {item.pole_pockets && item.pole_pockets !== "none" && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">Pole pockets:</span>
                                <span className="text-gray-900">${(item.pole_pocket_cost_cents / 100).toFixed(2)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-3">
                          <div className="flex items-center bg-gray-50 rounded-lg p-1">
                            <button
                              onClick={() => onUpdateQuantity(item.id, Math.max(1, item.quantity - 1))}
                              className="p-1.5 hover:bg-white rounded-md transition-colors"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-8 text-center font-medium text-sm">{item.quantity}</span>
                            <button
                              onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                              className="p-1.5 hover:bg-white rounded-md transition-colors"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-gray-900 text-sm">
                              ${(item.price * item.quantity).toFixed(2)}
                            </p>
                            <p className="text-xs text-gray-500">
                              ${item.price.toFixed(2)} each
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {items.length > 0 && (
            <div className="border-t p-6">
              <div className="space-y-2 mb-4">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>${(subtotalCents / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-green-600 font-medium">
                  <span>Shipping:</span>
                  <span>FREE</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax (6%):</span>
                  <span>${(taxCents / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold text-lg border-t pt-2">
                  <span>Total:</span>
                  <span>${(totalCents / 100).toFixed(2)}</span>
                </div>
              </div>
              
              <button
                onClick={handleCheckout}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-4 rounded-2xl font-semibold text-lg shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-200"
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