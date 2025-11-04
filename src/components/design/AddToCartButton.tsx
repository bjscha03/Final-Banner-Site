import React from 'react';
import { ShoppingCart } from 'lucide-react';
import { useQuoteStore } from '@/store/quote';
import { useCartStore } from '@/store/cart';
import { useEditorStore } from '@/store/editor';
import { useToast } from '@/hooks/use-toast';
import { calcTotals } from '@/lib/pricing';

interface AddToCartButtonProps {
  className?: string;
  size?: 'default' | 'large';
  showIcon?: boolean;
}

/**
 * Reusable Add to Cart / Update Cart Item button
 * Shows "Update Cart Item" when editing, "Add to Cart" when creating new
 */
const AddToCartButton: React.FC<AddToCartButtonProps> = ({ 
  className = '', 
  size = 'default',
  showIcon = true 
}) => {
  const quote = useQuoteStore();
  const { addFromQuote, updateCartItem } = useCartStore();
  const { toast } = useToast();
  
  const isEditing = quote.editingItemId !== null && quote.editingItemId !== undefined;
  const { file, widthIn, heightIn, quantity, material, grommets, polePockets, polePocketSize, addRope } = quote;
  
  // Calculate pricing
  const baseTotals = calcTotals({
    widthIn,
    heightIn,
    quantity,
    material,
    grommets,
    polePockets,
    polePocketSize,
    addRope,
  });

  // Simple minimum order check (can be enhanced)
  const canProceed = file !== null;

  // Sync editor objects back to quote store before adding to cart
  const syncEditorToQuote = () => {
    const editorObjects = useEditorStore.getState().objects;
    
    // Find the overlay image in editor objects (type: 'image')
    const overlayImageObj = editorObjects.find(obj => obj.type === 'image');
    
    if (overlayImageObj && quote.overlayImage) {
      // Convert position from inches to percentage
      const xPercent = (overlayImageObj.x / widthIn) * 100;
      const yPercent = (overlayImageObj.y / heightIn) * 100;
      
      console.log('🔄 SYNC: Syncing overlay image position from editor to quote');
      console.log('🔄 SYNC: Editor position (inches):', overlayImageObj.x, overlayImageObj.y);
      console.log('🔄 SYNC: Converted to percentage:', xPercent, yPercent);
      console.log('🔄 SYNC: Canvas dimensions:', widthIn, heightIn);
      
      // Update quote store with current position
      quote.set({
        overlayImage: {
          ...quote.overlayImage,
          position: { x: xPercent, y: yPercent },
          scale: overlayImageObj.width / 4, // Assuming 4 inches is default width
          aspectRatio: overlayImageObj.width / overlayImageObj.height,
        }
      });
      
      console.log('✅ SYNC: Updated quote.overlayImage.position to:', { x: xPercent, y: yPercent });
    }
  };

  const handleClick = () => {
    console.log('🔍 AddToCartButton clicked - isEditing:', isEditing, 'editingItemId:', quote.editingItemId);
    
    // CRITICAL: Sync editor state to quote before adding/updating cart
    syncEditorToQuote();
    
    if (!file) {
      toast({
        title: "Upload Required",
        description: "Please upload your artwork before " + (isEditing ? "updating" : "adding to cart") + ".",
        variant: "destructive",
      });
      return;
    }

    // Prepare pricing data
    const pricing = {
      unit_price_cents: Math.round(baseTotals.unit * 100),
      rope_cost_cents: Math.round(baseTotals.rope * 100),
      rope_pricing_mode: 'per_item' as const,
      pole_pocket_cost_cents: Math.round(baseTotals.polePocket * 100),
      pole_pocket_pricing_mode: 'per_item' as const,
      line_total_cents: Math.round(baseTotals.materialTotal * 100),
    };

    if (isEditing) {
      // UPDATE existing cart item
      if (!quote.editingItemId) {
        console.error('No editingItemId found');
        toast({
          title: "Error",
          description: "Could not find the item to update.",
          variant: "destructive",
        });
        return;
      }

      // Extract quote data
      const quoteData = {
        widthIn: quote.widthIn,
        heightIn: quote.heightIn,
        quantity: quote.quantity,
        material: quote.material,
        grommets: quote.grommets,
        polePockets: quote.polePockets,
        polePocketSize: quote.polePocketSize,
        addRope: quote.addRope,
        previewScalePct: quote.previewScalePct,
        textElements: quote.textElements,
        overlayImage: quote.overlayImage,
        file: quote.file,
        imageScale: quote.imageScale,
        imagePosition: quote.imagePosition,
      };

      updateCartItem(quote.editingItemId, quoteData as any, undefined, pricing);
      
      // Clear the editingItemId
      quote.set({ editingItemId: null });
      
      toast({
        title: "Cart Updated",
        description: "Your banner design has been updated in the cart.",
      });
      
      // Scroll to top so user can see the cart
      window.scrollTo({ top: 0, behavior: 'smooth' });      
      // Reset design area after successful update
      console.log('🔄 RESET: About to call resetDesign() after update');
      console.log('🔄 RESET: Current file before reset:', quote.file);
      quote.resetDesign();
      console.log('🔄 RESET: resetDesign() called');
      console.log('🔄 RESET: Current file after reset:', quote.file);
    } else {
      // ADD new item to cart
      // Pass the entire quote state, not just pricing
      addFromQuote(quote, undefined, pricing);
      
      toast({
        title: "Added to Cart",
        description: "Your banner design has been added to the cart.",
      });
      
      // Reset design area after successful add
      
      // Scroll to top so user can see the cart
      window.scrollTo({ top: 0, behavior: 'smooth' });      console.log('🔄 RESET: About to call resetDesign() after add');

      console.log('🔄 RESET: Current file before reset:', quote.file);
      quote.resetDesign();
      console.log('🔄 RESET: resetDesign() called');
      console.log('🔄 RESET: Current file after reset:', quote.file);
    }
  };

  const sizeClasses = size === 'large' 
    ? 'py-5 text-xl' 
    : 'py-3.5 text-base';

  const iconSize = size === 'large' ? 'h-6 w-6' : 'h-5 w-5';

  return (
    <button
      onClick={handleClick}
      disabled={!canProceed}
      className={`w-full ${sizeClasses} rounded-lg font-bold shadow-sm transition-all duration-300 flex items-center justify-center gap-3 ${
        canProceed 
          ? 'bg-orange-500 hover:bg-orange-600 text-white hover:shadow-md transform hover:scale-[1.02]' 
          : 'bg-gray-400 text-gray-600 cursor-not-allowed'
      } ${className}`}
    >
      {showIcon && <ShoppingCart className={iconSize} />}
      <span>{isEditing ? 'Update Cart Item' : 'Add to Cart'}</span>
    </button>
  );
};

export default AddToCartButton;
