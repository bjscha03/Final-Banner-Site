import React from 'react';
import { X, Trash2, Plus, Minus, ShoppingBag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usd } from '@/lib/pricing';
import { computeCartTotals, Cart as UICart, CartItem as UICartItem, CartOption } from '@/lib/cart-pricing';
import { CartItem } from '@/store/cart';

interface CartModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQuantity: (id: string, quantity: number) => void;
  onRemoveItem: (id: string) => void;
}

function mapItemsToUICart(items: CartItem[]): { cart: UICart; unitEachById: Record<string, number>; lineTotalById: Record<string, number>; ropeOptById: Record<string, { mode: 'per_item'|'per_order'; priceCents: number }|undefined>; poleOptById: Record<string, number> } {
  const uiItems: UICartItem[] = items.map((it) => {
    const options: CartOption[] = [];
    // Rope option
    if ((it as any).rope_feet && (it as any).rope_feet > 0) {
      const priceCents = Math.round(((it as any).rope_feet || 0) * 2 * 100);
      const mode = ((it as any).rope_pricing_mode === 'per_order') ? 'per_order' : 'per_item';
      options.push({ id: `rope:${it.id}`, name: 'Rope', priceCents, pricingMode: mode });
    }
    // Pole pocket option derived per-item from authoritative line value when available
    if ((it as any).pole_pockets && (it as any).pole_pockets !== 'none') {
      const qty = Math.max(1, it.quantity || 1);
      const ropeLineCents = Math.round((((it as any).rope_feet || 0) * 2 * 100) * qty);
      const baseLineCents = Math.round((it.unit_price_cents || 0) * qty);
      const pocketLineCents = (it as any).pole_pocket_cost_cents ?? Math.max(0, (it.line_total_cents || 0) - baseLineCents - ropeLineCents);
      const perItemPocketCents = Math.round(pocketLineCents / qty);
      options.push({ id: `pole:${it.id}`, name: `Pole pockets: ${(it as any).pole_pockets}`, priceCents: perItemPocketCents, pricingMode: 'per_item' });
    }
    return {
      id: it.id,
      sku: it.id,
      title: `Custom Banner ${it.width_in}" × ${it.height_in}"`,
      unitPriceCents: it.unit_price_cents || 0,
      qty: it.quantity || 1,
      options,
    };
  });

  const cart: UICart = { items: uiItems, shippingCents: 0, taxRatePct: 6, discountsCents: 0 };
  const totals = computeCartTotals(cart);

  const unitEachById: Record<string, number> = {};
  const lineTotalById: Record<string, number> = {};
  const ropeOptById: Record<string, { mode: 'per_item'|'per_order'; priceCents: number }|undefined> = {};
  const poleOptById: Record<string, number> = {};

  uiItems.forEach((ui, idx) => {
    const t = totals.itemTotals[idx];
    unitEachById[ui.id] = t.unitEachCents;
    lineTotalById[ui.id] = t.lineTotalCents;
    const rope = ui.options.find(o => o.id.startsWith('rope:'));
    ropeOptById[ui.id] = rope ? { mode: rope.pricingMode, priceCents: rope.priceCents } : undefined;
    const pole = ui.options.find(o => o.id.startsWith('pole:'));
    poleOptById[ui.id] = pole ? pole.priceCents : 0;
  });

  return { cart: { ...cart, items: uiItems }, unitEachById, lineTotalById, ropeOptById, poleOptById };
}

const CartModal: React.FC<CartModalProps> = ({ isOpen, onClose, items, onUpdateQuantity, onRemoveItem }) => {
  const navigate = useNavigate();
  if (!isOpen) return null;

  const { cart, unitEachById, lineTotalById, ropeOptById, poleOptById } = mapItemsToUICart(items);
  const totals = computeCartTotals(cart);

  const handleCheckout = () => {
    onClose();
    navigate('/checkout');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-xl">
        <div className="flex h-full">
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
                  const unitEach = unitEachById[item.id] || (item.unit_price_cents || 0);
                  const lineTotal = lineTotalById[item.id] || (item.line_total_cents || 0);
                  const ropeOpt = ropeOptById[item.id];
                  const poleEach = poleOptById[item.id] || 0;
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
                                {item.rope_feet > 0 && (
                                  <div>Rope: {ropeOpt?.mode === 'per_item' ? `${usd(ropeOpt.priceCents/100)} × ${item.quantity} = ${usd((ropeOpt.priceCents*item.quantity)/100)}` : `${usd((ropeOpt?.priceCents||0)/100)}`}</div>
                                )}
                                {item.pole_pockets && item.pole_pockets !== 'none' && (
                                  <div>Pole pockets: {usd(poleEach/100)} × {item.quantity} = {usd((poleEach*item.quantity)/100)}</div>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-gray-900">{usd(lineTotal/100)}</p>
                              <p className="text-xs text-gray-500">{usd(unitEach/100)} each</p>
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
                <span>{usd(totals.subtotalCents/100)}</span>
              </div>
              <div className="flex justify-between text-green-600 font-medium">
                <span>Shipping:</span>
                <span>FREE</span>
              </div>
              <div className="flex justify-between">
                <span>Tax (6%):</span>
                <span>{usd(totals.taxCents/100)}</span>
              </div>
              <div className="flex justify-between font-semibold text-lg border-t pt-2">
                <span>Total:</span>
                <span>{usd(totals.totalCents/100)}</span>
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
