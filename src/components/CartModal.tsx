import React from 'react';
import { X, Trash2, Plus, Minus, ShoppingBag, Edit, Eye, Tag } from 'lucide-react';
import BannerPreview from './cart/BannerPreview';
import { useNavigate } from 'react-router-dom';
import { usd } from '@/lib/pricing';
import { useCartStore } from '@/store/cart';
import { useToast } from '@/hooks/use-toast';
import { useQuoteStore } from '@/store/quote';
import { useAuth } from '@/lib/auth';
import { getGrommetLabel } from '@/lib/grommets';
import { getItemDisplayName, isYardSignItem } from '@/lib/product-display';
import { getProductCopy, getDominantProductType } from '@/lib/product-copy';

interface CartModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CartModal: React.FC<CartModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { items: rawItems, getMigratedItems, updateQuantity, removeItem, loadItemIntoQuote, getSubtotalCents, getTaxCents, getTotalCents, getResolvedDiscount } = useCartStore();

  // CRITICAL: Use migrated items to ensure rope/pole pocket costs are calculated
  const items = getMigratedItems();
  const { toast } = useToast();
  const { loadFromCartItem } = useQuoteStore();
  const { user } = useAuth();

  // Product-aware copy based on cart contents
  const dominantProductType = getDominantProductType(items);
  const productCopy = getProductCopy(dominantProductType);

  // Per-item source detection replaces session-wide isGoogleAdsLanding flag
  // Each cart item now has a 'source' field set at add-to-cart time


  if (!isOpen) return null;

  const handleCheckout = () => {
    onClose();
    navigate('/checkout');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleEdit = async (itemId: string) => {
    try {
      const item = loadItemIntoQuote(itemId);
      
      if (!item) {
        toast({
          title: "Error",
          description: "Could not find the item to edit.",
          variant: "destructive",
        });
        return;
      }

      // Check if this is a Canva design
      if (item.canva_design_id && user?.id) {
        toast({
          title: "Opening Canva...",
          description: "Redirecting to Canva editor",
        });
        
        try {
          const response = await fetch('/.netlify/functions/canva-get-edit-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              designId: item.canva_design_id,
              userId: user.id
            })
          });
          
          const data = await response.json();
          
          if (data.success && data.editUrl) {
            // Store the item ID so we can update it when user returns
            sessionStorage.setItem('canva-editing-cart-item-id', itemId);
            sessionStorage.setItem('canva-editing-width', String(item.width_in));
            sessionStorage.setItem('canva-editing-height', String(item.height_in));
            onClose();
            window.open(data.editUrl, '_blank');
            return;
          } else if (data.needsAuth) {
            toast({
              title: "Canva session expired",
              description: "Opening a new Canva session with your banner dimensions",
            });
            // Fall through to open new Canva session
          }
          // else: fall through to regular editor
        } catch (error) {
          console.error('Error getting Canva edit URL:', error);
          // Fall through to regular editor
        }
      }

      // Reset design state completely before loading cart item
      // This prevents image duplication from previous state
      const { resetDesign } = useQuoteStore.getState();
      resetDesign();
      
      // Small delay to ensure reset completes before loading new item
      setTimeout(() => {
        loadFromCartItem(item, itemId);
      }, 50);
      
      // Close modal and navigate to advanced design editor page
      onClose();
      navigate('/design-editor');
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);
      
    } catch (error) {
      console.error('Error in handleEdit:', error);
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
  const resolvedDiscount = getResolvedDiscount();

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
            <button onClick={onClose} aria-label="Close cart" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="h-6 w-6 text-gray-600" />
            </button>
          </div>

          {/* Items */}
          <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
            {items.length === 0 ? (
              <div className="text-center py-12">
                <ShoppingBag className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 text-lg mb-2">Your cart is empty</p>
                <p className="text-gray-500 text-sm mb-6">{productCopy.emptyCartPrompt}</p>
                <button 
                  onClick={onClose} 
                  className="bg-[#ff6b35] hover:bg-[#e16629] text-white px-6 py-3 rounded-lg font-semibold transition-colors shadow-md hover:shadow-lg"
                >
                  Continue Shopping
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Thumbnail preview notice */}
                <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700">
                  <Eye className="h-4 w-4 flex-shrink-0 mt-0.5 text-blue-500" />
                  <p>
                    <span className="font-medium">Preview only.</span> {productCopy.reviewNoticeBody}
                  </p>
                </div>
                {items.map((item) => {
                  const eachCents = computeEach(item);
                  const ropeCost = item.rope_cost_cents || 0;
                  const pocketCost = item.pole_pocket_cost_cents || 0;

                  return (
                    <div key={item.id} className="bg-white rounded-xl p-4 shadow-lg border border-gray-200 hover:shadow-xl transition-shadow">
                      {/* Thumbnail on top - centered */}
                      <div className="flex justify-center mb-4">
                        <BannerPreview
                            key={`thumbnail-${item.id}-${item.text_elements?.length || 0}-${item.image_scale || 1}`}
                            widthIn={item.width_in}
                            heightIn={item.height_in}
                            grommets={item.grommets}
                            imageUrl={item.thumbnail_url || item.file_url || item.web_preview_url || item.print_ready_url || item.aiDesign?.assets?.proofUrl}
                            material={item.material}
                            textElements={item.text_elements}
                            overlayImage={item.overlay_image}
                            imageScale={item.image_scale}
                            imagePosition={item.image_position}
                            fitMode={item.fit_mode || "fill"}
                            className="flex-shrink-0"
                            designServiceEnabled={item.design_service_enabled}
                            source={item.source}
                          />
                      </div>

                      {/* Title and Price on same line */}
                      <div className="flex justify-between items-start mb-3">
                        <h3 className="font-semibold text-gray-900 text-base">
                          {getItemDisplayName(item)}
                        </h3>
                        <div className="text-right ml-4 flex-shrink-0">
                          <p className="font-bold text-[#18448D] text-lg">
                            {usd(item.line_total_cents/100)}
                          </p>
                          <p className="text-xs text-gray-600">
                            {usd(eachCents/100)} each
                          </p>
                        </div>
                      </div>

                      {/* Two column layout on desktop, stacked on mobile */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                        {/* Left column: Meta information */}
                        <div className="space-y-1 text-xs text-gray-600">
                          {isYardSignItem(item) ? (
                            <>
                              <p><span className="font-medium text-gray-700">Material:</span> Corrugated Plastic</p>
                              <p><span className="font-medium text-gray-700">Print:</span> {item.yard_sign_sidedness === 'double' ? 'Double-Sided' : 'Single-Sided'}</p>
                              {item.yard_sign_design_count && item.yard_sign_design_count > 0 && (
                                <p><span className="font-medium text-gray-700">Uploaded Designs:</span> {item.yard_sign_design_count}</p>
                              )}
                              <p><span className="font-medium text-gray-700">Total Signs:</span> {item.quantity}</p>
                              {item.yard_sign_step_stakes_enabled && item.yard_sign_step_stakes_qty && item.yard_sign_step_stakes_qty > 0 && (
                                <p><span className="font-medium text-gray-700">Step Stakes:</span> {item.yard_sign_step_stakes_qty}</p>
                              )}
                            </>
                          ) : (
                            <>
                              <p><span className="font-medium text-gray-700">Material:</span> {item.material}</p>
                              {item.grommets && item.grommets !== 'none' && (
                                <p><span className="font-medium text-gray-700">Grommets:</span> {getGrommetLabel(item.grommets)}</p>
                              )}
                              {ropeCost > 0 && item.rope_feet && (
                                <p><span className="font-medium text-gray-700">Rope:</span> {item.rope_feet.toFixed(1)}ft</p>
                              )}
                              {item.pole_pockets && item.pole_pockets !== 'none' && (
                                <p><span className="font-medium text-gray-700">Pole pockets:</span> {item.pole_pockets}</p>
                              )}
                              {item.file_name && (
                                <p className="truncate" title={item.file_name}>
                                  <span className="font-medium text-gray-700">File:</span> {item.file_name}
                                </p>
                              )}
                            </>
                          )}
                        </div>

                        {/* Right column: Price Breakdown */}
                        <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-200">
                          <h4 className="text-xs font-semibold text-gray-900 mb-1.5">Price Breakdown</h4>
                          <div className="space-y-1 text-xs">
                            {isYardSignItem(item) ? (
                              <>
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Signs ({item.quantity} × {usd(item.unit_price_cents/100)}):</span>
                                  <span className="text-gray-900 font-medium">{usd((item.unit_price_cents * item.quantity)/100)}</span>
                                </div>
                                {item.yard_sign_step_stakes_enabled && item.yard_sign_stakes_subtotal_cents && item.yard_sign_stakes_subtotal_cents > 0 && (
                                  <div className="flex justify-between">
                                    <span className="text-gray-600">Step Stakes ({item.yard_sign_step_stakes_qty}):</span>
                                    <span className="text-gray-900 font-medium">{usd(item.yard_sign_stakes_subtotal_cents/100)}</span>
                                  </div>
                                )}
                              </>
                            ) : (
                              <>
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Base banner:</span>
                                  <span className="text-gray-900 font-medium">{usd((item.unit_price_cents * item.quantity)/100)}</span>
                                </div>
                                {console.log('🔍 [PRICE BREAKDOWN] Checking rope cost:', { ropeCost, rope_cost_cents: item.rope_cost_cents, rope_feet: item.rope_feet, willShow: ropeCost > 0 })}
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
                              </>
                            )}
                            <div className="flex justify-between font-semibold border-t border-gray-300 pt-1.5 mt-1.5">
                              <span className="text-gray-900">Line total:</span>
                              <span className="text-[#18448D]">{usd(item.line_total_cents/100)}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Quantity Controls and Action Buttons */}
                      <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-700 font-medium">Qty:</span>
                          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                            <button 
                              onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))} 
                              className="p-1.5 hover:bg-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
                              disabled={item.quantity <= 1}
                              aria-label="Decrease quantity"
                            >
                              <Minus className="h-3.5 w-3.5 text-gray-700" />
                            </button>
                            <span className="w-8 text-center font-semibold text-gray-900 text-sm">{item.quantity}</span>
                            <button 
                              onClick={() => updateQuantity(item.id, item.quantity + 1)} 
                              className="p-1.5 hover:bg-white rounded-md transition-colors"
                              aria-label="Increase quantity"
                            >
                              <Plus className="h-3.5 w-3.5 text-gray-700" />
                            </button>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1.5">
                          {item.source !== 'google-ads' && (
                            <button 
                              onClick={() => handleEdit(item.id)} 
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-[#18448D] hover:bg-[#0f2d5c] text-white rounded-lg text-xs font-medium transition-colors shadow-sm hover:shadow-md"
                              aria-label="Edit banner"
                            >
                              <Edit className="h-3.5 w-3.5" />
                              <span>Edit</span>
                            </button>
                          )}
                          {item.source === 'google-ads' && (
                            <button 
                              onClick={() => { onClose(); navigate('/google-ads-banner'); }} 
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-[#18448D] hover:bg-[#0f2d5c] text-white rounded-lg text-xs font-medium transition-colors shadow-sm hover:shadow-md"
                              aria-label={isYardSignItem(item) ? "Order another yard sign" : "Order another banner"}
                            >
                              <Plus className="h-3.5 w-3.5" />
                              <span>{isYardSignItem(item) ? 'New Sign' : 'New Banner'}</span>
                            </button>
                          )}
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
              {/* Single "Best Discount Wins" line - no stacking */}
              {resolvedDiscount.appliedDiscountAmountCents > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-green-600">
                    <span className="font-medium flex items-center gap-1">
                      <Tag className="h-4 w-4" />
                      {resolvedDiscount.appliedDiscountLabel}
                    </span>
                    <span className="font-semibold">-{usd(resolvedDiscount.appliedDiscountAmountCents/100)}</span>
                  </div>
                  {resolvedDiscount.helperMessage && (
                    <p className="text-xs text-gray-500 italic">{resolvedDiscount.helperMessage}</p>
                  )}
                </div>
              )}
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
              {/* Friday shipping badge */}
              <div className="flex items-center justify-center gap-2 mt-3 py-2 px-3 bg-blue-50 border border-blue-200 rounded-lg">
                <span className="text-sm font-medium text-blue-700">📦 Friday orders arrive Tuesday.</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CartModal;
