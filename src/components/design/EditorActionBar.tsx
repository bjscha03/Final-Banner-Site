/**
 * EditorActionBar Component
 * 
 * Sticky top-right action bar for the advanced banner editor.
 * Provides prominent, context-aware buttons for:
 * - Preview (shows modal with full-size banner screenshot)
 * - Add to Cart (when creating new banner)
 * - Update Cart (when editing existing cart item)
 * 
 * Uses brand colors: #18448D (blue) for buttons
 * 
 * This component triggers the PricingCard's add/update functions via custom events
 * to avoid code duplication and maintain single source of truth.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Eye, ShoppingCart, RefreshCw } from 'lucide-react';
import { useQuoteStore } from '@/store/quote';
import { useEditorStore } from '@/store/editor';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface EditorActionBarProps {
  canvasRef?: React.RefObject<any>;
  onGenerateThumbnail?: () => void;
}

const EditorActionBar: React.FC<EditorActionBarProps> = ({ canvasRef, onGenerateThumbnail }) => {
  const [showPreview, setShowPreview] = useState(false);
  const { editingItemId, widthIn, heightIn, material, grommets, file, textElements } = useQuoteStore();
  const { canvasThumbnail, objects: editorObjects, setCanvasThumbnail } = useEditorStore();
  const { toast } = useToast();

  const isEditing = !!editingItemId;
  
  // Check if there's any content on the canvas
  const hasContent = file || textElements.length > 0 || editorObjects.length > 0;

  const handlePreview = () => {
    console.log('🔍 [EditorActionBar] Preview button clicked');
    
    // Regenerate thumbnail to ensure it's up-to-date with latest changes
    // (background color, grommets, etc.)
    if (onGenerateThumbnail) {
      console.log('🔍 [EditorActionBar] Regenerating thumbnail before preview');
      onGenerateThumbnail();
    }
    
    // Small delay to ensure thumbnail is generated
    setTimeout(() => {
      if (!canvasThumbnail) {
        toast({
          title: 'Preview Not Available',
          description: 'Please add some content to your banner first.',
          variant: 'destructive',
        });
        return;
      }

      console.log('🔍 [EditorActionBar] Opening preview modal with thumbnail');
      setShowPreview(true);
    }, 100);
  };

  const handleAction = () => {
    console.log(`🎯 [EditorActionBar] ${isEditing ? 'Update' : 'Add to'} Cart button clicked`);
    
    if (!hasContent) {
      toast({
        title: 'Content Required',
        description: 'Please add some content to your banner before adding to cart.',
        variant: 'destructive',
      });
      return;
    }

    // Find and click the PricingCard's Add/Update button
    // This ensures we use the same logic without duplicating code
    const buttonText = isEditing ? 'Update Cart' : 'Add to Cart';
    const buttons = Array.from(document.querySelectorAll('button'));
    const pricingButton = buttons.find(btn => btn.textContent?.includes(buttonText));
    
    if (pricingButton) {
      console.log(`🎯 [EditorActionBar] Clicking PricingCard "${buttonText}" button`);
      pricingButton.click();
    } else {
      console.warn(`⚠️ [EditorActionBar] Could not find "${buttonText}" button in PricingCard`);
      toast({
        title: 'Error',
        description: 'Could not find the cart button. Please try using the button in the pricing panel.',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      {/* Sticky Action Bar */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
        {/* Preview Button */}
        <Button
          onClick={handlePreview}
          className="bg-[#18448D] hover:bg-[#0f2d5c] text-white shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-2"
          size="lg"
        >
          <Eye className="h-5 w-5" />
          <span className="hidden sm:inline">Preview</span>
        </Button>

        {/* Add to Cart / Update Cart Button */}
        <Button
          onClick={handleAction}
          disabled={!hasContent}
          className={`shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-2 ${
            hasContent
              ? 'bg-[#18448D] hover:bg-[#0f2d5c] text-white'
              : 'bg-gray-400 text-gray-600 cursor-not-allowed'
          }`}
          size="lg"
        >
          {isEditing ? (
            <>
              <RefreshCw className="h-5 w-5" />
              <span className="hidden sm:inline">Update Cart</span>
              <span className="sm:hidden">Update</span>
            </>
          ) : (
            <>
              <ShoppingCart className="h-5 w-5" />
              <span className="hidden sm:inline">Add to Cart</span>
              <span className="sm:hidden">Add</span>
            </>
          )}
        </Button>
      </div>

      {/* Preview Modal */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-[#18448D]">
              Banner Preview
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Banner Details */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-semibold text-gray-700">Size:</span>{' '}
                <span className="text-gray-900">{widthIn}" × {heightIn}"</span>
              </div>
              <div>
                <span className="font-semibold text-gray-700">Material:</span>{' '}
                <span className="text-gray-900">{material}</span>
              </div>
              <div>
                <span className="font-semibold text-gray-700">Grommets:</span>{' '}
                <span className="text-gray-900">{grommets === 'none' ? 'None' : grommets}</span>
              </div>
            </div>

            {/* Preview Image */}
            {canvasThumbnail && (
              <div className="bg-gray-100 rounded-lg p-4 flex items-center justify-center">
                <img
                  src={canvasThumbnail}
                  alt="Banner Preview"
                  className="max-w-full max-h-[60vh] object-contain rounded shadow-lg"
                />
              </div>
            )}

            {/* Info Text */}
            <p className="text-sm text-gray-600 text-center">
              This is a preview of your banner design. The actual printed banner will be high-resolution.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EditorActionBar;
