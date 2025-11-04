import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth, isAdmin } from '@/lib/auth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useEditorStore } from '@/store/editor';
import { useQuoteStore } from '@/store/quote';
import { useCartStore } from '@/store/cart';
import UpsellModal, { UpsellOption } from '@/components/cart/UpsellModal';
import { 
  Upload, 
  Type, 
  Settings, 
  Maximize2, 
  Wrench,
  ShoppingCart,
  Eye,
  Palette, 
  Sliders,
  Download, 
  Sparkles,
  X
} from 'lucide-react';
import EditorCanvas from './editor/EditorCanvas';
import AssetsPanel from './editor/AssetsPanel';
import TextPanel from './editor/TextPanel';
import ObjectInspector from './editor/ObjectInspector';
import BrandColorsPanel from './editor/BrandColorsPanel';
import CanvasSettingsPanel from './editor/CanvasSettingsPanel';
import MaterialCard from './MaterialCard';
import SizeQuantityCard from './SizeQuantityCard';
import OptionsCard from './OptionsCard';
// PricingCard removed - users add to cart via blue button


interface BannerEditorLayoutProps {
  onOpenAIModal?: () => void;
}

type PanelType = 'uploads' | 'text' | 'material' | 'size' | 'options' | 'inspector' | 'colors' | 'canvas' | null;

const BannerEditorLayout: React.FC<BannerEditorLayoutProps> = ({ onOpenAIModal }) => {
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<PanelType>(null);
  const canvasRef = useRef<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showUpsellModal, setShowUpsellModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'cart' | 'checkout' | null>(null);
  const [dontShowUpsellAgain, setDontShowUpsellAgain] = useState(false);



  const desktopPanelRef = useRef<HTMLDivElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdminUser = user && isAdmin(user);
  const { exportToJSON, setCanvasThumbnail, canvasThumbnail, objects: editorObjects, addObject, reset: resetEditor, canvasBackgroundColor, showGrommets, setShowGrommets } = useEditorStore();
  const quote = useQuoteStore();
  const { set: setQuote, editingItemId, overlayImage, textElements, file, grommets, widthIn, heightIn, material, resetDesign } = quote;
  
  // Helper function to update grommets in quote store
  const setGrommets = (value: any) => {
    setQuote({ grommets: value });
  };

  // Check if user should see upsell (only if there are actually options to upsell)
  const shouldShowUpsell = useMemo(() => {
    if (dontShowUpsellAgain) return false;
    
    // Count how many upsell options are available
    let availableOptions = 0;
    
    // Grommets available if none selected AND pole pockets not selected (mutual exclusivity)
    if (grommets === 'none' && quote.polePockets === 'none') {
      availableOptions++;
    }
    
    // Rope available if not selected
    if (!quote.addRope) {
      availableOptions++;
    }
    
    // Pole pockets available if none selected AND grommets not selected (mutual exclusivity)
    if (quote.polePockets === 'none' && grommets === 'none') {
      availableOptions++;
    }
    
    // Only show upsell if there are actually options to offer
    return availableOptions > 0;
  }, [grommets, quote.addRope, quote.polePockets, dontShowUpsellAgain]);

  // Load "don't show again" preference from localStorage
  useEffect(() => {
    const dontShow = localStorage.getItem('upsell-dont-show-again') === 'true';
    setDontShowUpsellAgain(dontShow);
  }, []);

  const { addFromQuote, updateCartItem } = useCartStore();
  
  // Check if there's any content on the canvas
  const hasContent = file || textElements.length > 0 || editorObjects.length > 0;
  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      console.log('[BannerEditorLayout] Click detected, target:', event.target);
      console.log('[BannerEditorLayout] desktopPanelRef.current:', desktopPanelRef.current);
      console.log('[BannerEditorLayout] mobilePanelRef.current:', mobilePanelRef.current);
      
      const clickedInsideDesktop = desktopPanelRef.current?.contains(event.target as Node);
      const clickedInsideMobile = mobilePanelRef.current?.contains(event.target as Node);
      
      console.log('[BannerEditorLayout] Clicked inside desktop panel?', clickedInsideDesktop);
      console.log('[BannerEditorLayout] Clicked inside mobile panel?', clickedInsideMobile);
      
      // If click is inside either panel, don't close
      if (clickedInsideDesktop || clickedInsideMobile) {
        console.log('[BannerEditorLayout] Click is inside panel, keeping it open');
        return;
      }
      
      const target = event.target as HTMLElement;
      console.log('[BannerEditorLayout] Click is outside panel, checking if sidebar button or dropdown...');
      
      // Don't close if clicking on sidebar buttons
      if (target.closest('[data-sidebar-button]')) {
        console.log('[BannerEditorLayout] Click on sidebar button, keeping panel open');
        return;
      }
      
      // Don't close if clicking on Radix UI portals (Select dropdowns, etc.)
      if (target.closest('[data-radix-popper-content-wrapper]') || 
          target.closest('[data-radix-select-viewport]') ||
          target.closest('[role="listbox"]') ||
          target.closest('[role="option"]')) {
        console.log('[BannerEditorLayout] Click on dropdown/portal, keeping panel open');
        return;
      }

      // Don't close if clicking on upsell modal (rendered as portal)
      if (target.closest('[data-upsell-modal]')) {
        console.log('[BannerEditorLayout] Click on upsell modal, keeping panel open');
        return;
      }
      
      console.log('[BannerEditorLayout] Closing panel due to outside click');
      setActivePanel(null);
    };

    if (activePanel) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [activePanel]);

  const handleExport = async (format: 'print-pdf' | 'proof-pdf' | 'png') => {
    if (!canvasRef.current) {
      toast({
        title: 'Export Failed',
        description: 'Canvas not ready. Please try again.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const stage = canvasRef.current.getStage();
      if (!stage) throw new Error('Stage not found');

      if (format === 'png') {
        const dataURL = stage.toDataURL({
          pixelRatio: 3,
          mimeType: 'image/png',
        });

        const link = document.createElement('a');
        link.download = `banner-design-${Date.now()}.png`;
        link.href = dataURL;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast({
          title: 'Export Successful',
          description: 'Your banner has been exported as PNG.',
        });
      } else {
        toast({
          title: 'Coming Soon',
          description: 'PDF export will be available soon. Use PNG export for now.',
        });
      }
    } catch (error) {
      toast({
        title: 'Export Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  // Generate thumbnail for cart preview
  const generateThumbnail = () => {
    if (!canvasRef.current) {
      return null;
    }

    try {
      const stage = canvasRef.current.getStage();
      if (!stage) {
        return null;
      }

      // Get current visibility state and selection
      const editorState = useEditorStore.getState();
      const { showBleed, showSafeZone, showGrid, setShowBleed, setShowSafeZone, setShowGrid } = editorState;
      const wasShowingBleed = showBleed;
      const wasShowingSafeZone = showSafeZone;
      const wasShowingGrid = showGrid;
      
      // CRITICAL: Clear selection to hide transformer boxes before generating thumbnail
      if (editorState.clearSelection) {
        editorState.clearSelection();
      }
      
      // Hide borders and grid for clean thumbnail
      setShowBleed(false);
      setShowSafeZone(false);
      setShowGrid(false);
      
      // Force immediate redraw to remove transformer from canvas
      const layer = stage.getLayers()[0];
      if (layer) {
        layer.batchDraw();
      }
      
      // Wait for React to re-render (use setTimeout instead of requestAnimationFrame)
      setTimeout(() => {
        try {
          // Get the layer to find the banner bounds
          const layer = stage.getLayers()[0];
          if (!layer) {
            console.error('[BannerEditorLayout] No layer found');
            setShowBleed(wasShowingBleed);
            setShowSafeZone(wasShowingSafeZone);
            return;
          }

          // Get the background rect (first child) to find banner position
          const backgroundRect = layer.getChildren()[0];
          if (!backgroundRect) {
            console.error('[BannerEditorLayout] No background rect found');
            setShowBleed(wasShowingBleed);
            setShowSafeZone(wasShowingSafeZone);
            return;
          }

          // Get the actual position and size of the background rect
          // This gives us the banner area bounds
          const x = backgroundRect.x();
          const y = backgroundRect.y();
          const width = backgroundRect.width();
          const height = backgroundRect.height();
          
          console.log('[BannerEditorLayout] Banner bounds:', { x, y, width, height });

          // Capture thumbnail - crop to just the banner area
          const dataURL = stage.toDataURL({
            x: x,
            y: y,
            width: width,
            height: height,
            pixelRatio: 2,
            mimeType: 'image/png',
          });

          console.log('[BannerEditorLayout] Generated thumbnail:', dataURL.substring(0, 50) + '...');
          setCanvasThumbnail(dataURL);
          
          // Restore original visibility
          setShowBleed(wasShowingBleed);
          setShowSafeZone(wasShowingSafeZone);
          setShowGrid(wasShowingGrid);
        } catch (error) {
          console.error('[BannerEditorLayout] Error generating thumbnail:', error);
          // Restore visibility even on error
          setShowBleed(wasShowingBleed);
          setShowSafeZone(wasShowingSafeZone);
          setShowGrid(wasShowingGrid);
        }
      }, 200); // Wait 200ms for React to re-render and text to load
      
      return null;
    } catch (error) {
      console.error('[BannerEditorLayout] Error generating thumbnail:', error);
      return null;
    }
  };



  // Auto-generate thumbnail when canvas content changes
  useEffect(() => {
    // Debounce thumbnail generation to avoid too many updates
    const timeoutId = setTimeout(() => {
      generateThumbnail();
    }, 500); // Wait 500ms after last change

    return () => clearTimeout(timeoutId);
  }, [editorObjects, canvasBackgroundColor, grommets, showGrommets]); // Re-generate when objects, background, or grommets change

  // Load cart item objects into canvas when editing
  useEffect(() => {
    if (!editingItemId) {
      console.log('[BannerEditorLayout] Not editing, skipping object load');
      return;
    }

    // Only load if we have objects to load
    const hasObjectsToLoad = (overlayImage && overlayImage.url) || (textElements && textElements.length > 0) || (file && file.url);
    
    if (!hasObjectsToLoad) {
      console.log('[BannerEditorLayout] No objects to load from cart item');
      return;
    }

    console.log('[BannerEditorLayout] Loading cart item objects for editing:', { editingItemId, overlayImage, textElements });
    console.log('[BannerEditorLayout] Current editor objects before load:', editorObjects);

    // CRITICAL: Clear existing objects first to prevent duplicates
    console.log('[BannerEditorLayout] Clearing existing objects before loading cart item');
    
    // Show grommets if they were selected in the cart item
    const shouldShowGrommets = grommets && grommets !== 'none';
    console.log('[BannerEditorLayout] Setting grommets visibility:', shouldShowGrommets, 'grommets:', grommets);
    setShowGrommets(shouldShowGrommets);

    resetEditor();

    // Small delay to ensure reset completes before adding objects
    setTimeout(() => {
      // CRITICAL: Only load background file if there are NO text elements
      // If text elements exist, the file is just a thumbnail with text baked in
      if (file && file.url && (!textElements || textElements.length === 0)) {
        console.log('[BannerEditorLayout] Adding background file to canvas (no text elements):', file);
        
        // Calculate dimensions to fit the canvas
        const canvasWidthPx = widthIn * 96; // Convert inches to pixels (96 DPI)
        const canvasHeightPx = heightIn * 96;
        
        // If we have artwork dimensions, use them to calculate proper size
        let imageWidth = canvasWidthPx;
        let imageHeight = canvasHeightPx;
        
        if (file.artworkWidth && file.artworkHeight) {
          const aspectRatio = file.artworkWidth / file.artworkHeight;
          const canvasAspectRatio = canvasWidthPx / canvasHeightPx;
          
          if (aspectRatio > canvasAspectRatio) {
            // Image is wider than canvas
            imageWidth = canvasWidthPx;
            imageHeight = canvasWidthPx / aspectRatio;
          } else {
            // Image is taller than canvas
            imageHeight = canvasHeightPx;
            imageWidth = canvasHeightPx * aspectRatio;
          }
        }
        
        addObject({
          type: 'image',
          url: file.url,
          x: (widthIn - (imageWidth / 96)) / 2, // Center horizontally
          y: (heightIn - (imageHeight / 96)) / 2, // Center vertically
          width: imageWidth / 96, // Convert back to inches
          height: imageHeight / 96,
          rotation: 0,
          opacity: 1,
          locked: false,
          visible: true,
          isPDF: file.isPdf || false,
        });
      }

      // Load overlay image if present
      if (overlayImage && overlayImage.url) {
        console.log('🖼️ [BUG 2 FIX] Loading overlayImage from cart:', overlayImage);
        console.log('🖼️ [BUG 2 FIX] overlayImage.position:', overlayImage.position);
        console.log('🖼️ [BUG 2 FIX] overlayImage.scale:', overlayImage.scale);
        console.log('🖼️ [BUG 2 FIX] overlayImage.aspectRatio:', overlayImage.aspectRatio);
        console.log('🖼️ [BUG 2 FIX] Canvas dimensions (inches):', widthIn, 'x', heightIn);
        
        // CRITICAL: Convert percentage-based position to inches
        // overlayImage.position is stored as percentage (0-100), need to convert to inches
        const xInches = overlayImage.position?.x != null ? (overlayImage.position.x / 100) * widthIn : widthIn / 2;
        const yInches = overlayImage.position?.y != null ? (overlayImage.position.y / 100) * heightIn : heightIn / 2;
        
        // Calculate dimensions based on scale and aspect ratio
        // Default to a reasonable size if not specified
        const defaultWidthInches = 4; // 4 inches default width
        const imageScale = overlayImage.scale || 1;
        const aspectRatio = overlayImage.aspectRatio || 1;
        
        const widthInches = defaultWidthInches * imageScale;
        const heightInches = widthInches / aspectRatio;
        
        console.log('🖼️ [BUG 2 FIX] Calculated position (inches):', xInches, yInches);
        console.log('🖼️ [BUG 2 FIX] Calculated dimensions (inches):', widthInches, 'x', heightInches);
        
        addObject({
          type: 'image',
          url: overlayImage.url,
          x: xInches,
          y: yInches,
          width: widthInches,
          height: heightInches,
          rotation: 0,
          opacity: 1,
          visible: true,
          locked: false,
        });
        
        console.log('✅ [BUG 2 FIX] Overlay image added to editor objects');
      }

      // Load text elements if present
      if (textElements && textElements.length > 0) {
        console.log('[BannerEditorLayout] Adding text elements to canvas:', textElements);
        textElements.forEach((textEl: any) => {
          // Convert percentage-based position to inches
          const xInches = textEl.xPercent != null ? (textEl.xPercent / 100) * widthIn : (textEl.x || 0);
          const yInches = textEl.yPercent != null ? (textEl.yPercent / 100) * heightIn : (textEl.y || 0);
          
          addObject({
            type: 'text',
            content: textEl.content, // TextElement uses 'content' property
            x: xInches,
            y: yInches,
            // Don't set width/height - let Konva auto-calculate based on text content
            // This prevents the transformer box from being too wide
            fontSize: textEl.fontSize || 24,
            fontFamily: textEl.fontFamily || 'Arial',
            color: textEl.color || '#000000',
            fill: textEl.color || '#000000',
            fontWeight: textEl.fontWeight || 'normal',
            fontStyle: textEl.fontStyle || 'normal',
            textDecoration: textEl.textDecoration || '',
            textAlign: textEl.textAlign || textEl.align || 'left',
            align: textEl.align || 'left',
            rotation: textEl.rotation || 0,
            opacity: 1,
            visible: true,
          });
        });
      }

      console.log('[BannerEditorLayout] Finished loading cart item objects');
    }, 100);
  }, [editingItemId]); // Only run when editingItemId changes

  const handlePreview = () => {
    console.log('🔍 [BannerEditorLayout] Preview button clicked');
    
    // Regenerate thumbnail to ensure it's up-to-date with latest changes
    console.log('🔍 [BannerEditorLayout] Regenerating thumbnail before preview');
    
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

      console.log('🔍 [BannerEditorLayout] Opening preview modal with thumbnail');
      setShowPreview(true);
    }, 100);
  };

    const handleAIGenerate = () => {
    if (!user) {
      toast({
        title: 'Login Required',
        description: 'Please sign in to use AI banner generation.',
        variant: 'destructive',
      });
      return;
    }

    // Check if AI is enabled
    if (import.meta.env.VITE_AI_BANNER_ENABLED === 'false') {
      toast({
        title: 'Feature Unavailable',
        description: 'AI banner generation is currently disabled.',
        variant: 'destructive',
      });
      return;
    }

    // Open the AI modal
    onOpenAIModal?.();
  };

  const handleAddToCart = async () => {
    console.log(`🎯 [BannerEditorLayout] ${editingItemId ? 'Update' : 'Add to'} Cart button clicked`);
    
    if (!hasContent) {
      toast({
        title: 'Content Required',
        description: 'Please add some content to your banner before adding to cart.',
        variant: 'destructive',
      });
      return;
    }

    // CRITICAL: Clear selection and force fresh thumbnail generation
    const editorState = useEditorStore.getState();
    if (editorState.clearSelection) {
      console.log('🔄 [UPDATE CART] Clearing selection...');
      editorState.clearSelection();
    }
    
    // Force immediate thumbnail generation (don't rely on auto-generation)
    console.log('🔄 [UPDATE CART] Generating fresh thumbnail NOW...');
    generateThumbnail();
    
    // Wait for thumbnail to be generated and stored
    await new Promise(resolve => setTimeout(resolve, 300));
    console.log('✅ [UPDATE CART] Fresh thumbnail generated');

    // Now use the fresh thumbnail from the store
    let thumbnailUrl = canvasThumbnail;
    
    console.log('🎨 [ADD TO CART] canvasThumbnail:', canvasThumbnail ? canvasThumbnail.substring(0, 50) + '...' : 'NULL');
    
    // Fallback to file URL if canvas thumbnail not available
    if (!thumbnailUrl && file && file.url) {
      thumbnailUrl = file.url;
      console.log('🎨 [ADD TO CART] Using file.url:', thumbnailUrl ? thumbnailUrl.substring(0, 50) + '...' : 'NULL');
    }
    // Fallback to first image object if still no thumbnail
    else if (!thumbnailUrl && editorObjects.length > 0) {
      const firstImage = editorObjects.find(obj => obj.type === 'image');
      if (firstImage && firstImage.url) {
        thumbnailUrl = firstImage.url;
        console.log('🎨 [ADD TO CART] Using firstImage.url:', thumbnailUrl ? thumbnailUrl.substring(0, 50) + '...' : 'NULL');
      }
    }
    
    console.log('🎨 [ADD TO CART] Final thumbnail URL:', thumbnailUrl ? thumbnailUrl.substring(0, 50) + '...' : 'NULL');
    
    // BUG 3 FIX: Extract overlay image from editor objects
    // CRITICAL: Get FRESH objects from store, not stale editorObjects variable
    const freshEditorObjects = useEditorStore.getState().objects;
    console.log('🖼️ [BUG 3 FIX] Extracting overlay image from FRESH editor objects...');
    console.log('🖼️ [BUG 3 FIX] Fresh editor objects:', freshEditorObjects);
    console.log('🖼️ [BUG 3 FIX] Stale editorObjects:', editorObjects);
    console.log('🖼️ [BUG 3 FIX] Current quote.overlayImage:', quote.overlayImage);
    
    // Find image objects in editor (excluding background images)
    const imageObjects = freshEditorObjects.filter(obj => obj.type === 'image');
    console.log('🖼️ [BUG 3 FIX] Found image objects:', imageObjects.length);
    
    // Extract overlay image from editor objects
    // The overlay image is the image object that's NOT the background file
    let currentOverlayImage = quote.overlayImage; // Start with existing
    
    if (imageObjects.length > 0) {
      // If we have image objects, use the first one as overlay (or find the non-background one)
      const overlayObj = imageObjects.find(obj => obj.url !== quote.file?.url) || imageObjects[0];
      
      if (overlayObj) {
        console.log('🖼️ [BUG 3 FIX] Found overlay object in editor:', overlayObj);
        
        // Convert editor object position (inches) to percentage for storage
        const xPercent = (overlayObj.x / widthIn) * 100;
        const yPercent = (overlayObj.y / heightIn) * 100;
        
        // Calculate aspect ratio from width/height
        const aspectRatio = overlayObj.width && overlayObj.height ? overlayObj.width / overlayObj.height : 1;
        
        // Calculate scale based on default size (4 inches)
        const defaultWidthInches = 4;
        const scale = overlayObj.width ? overlayObj.width / defaultWidthInches : 1;
        
        currentOverlayImage = {
          name: quote.overlayImage?.name || 'overlay-image',
          url: overlayObj.url || '',
          fileKey: quote.overlayImage?.fileKey || '',
          position: { x: xPercent, y: yPercent },
          aspectRatio: aspectRatio,
          scale: scale,
        };
        
        console.log('🖼️ [BUG 3 FIX] Created overlayImage from editor object:', currentOverlayImage);
      }
    } else {
      console.log('🖼️ [BUG 3 FIX] No image objects in editor, using quote.overlayImage');
    }
    
    // Calculate pricing (simplified - using base pricing without upsells)
    const sqft = (widthIn * heightIn) / 144;
    const basePrice = material === '13oz Vinyl' ? 3.50 : 4.50;
    const unitPrice = sqft * basePrice;
    const ropePrice = grommets === 'Grommets + Rope' ? 15 : 0;
    const polePocketPrice = quote.polePockets === 'Yes' ? 25 : 0;
    const lineTotal = (unitPrice + ropePrice + polePocketPrice) * quote.quantity;
    
    const pricing = {
      unit_price_cents: Math.round(unitPrice * 100),
      rope_cost_cents: Math.round(ropePrice * 100),
      rope_pricing_mode: 'per_item' as const,
      pole_pocket_cost_cents: Math.round(polePocketPrice * 100),
      pole_pocket_pricing_mode: 'per_item' as const,
      line_total_cents: Math.round(lineTotal * 100),
    };
    
    // Extract quote data - GET FRESH VALUES FROM STORE
    const freshQuoteForCart = useQuoteStore.getState();
    const quoteData = {
      widthIn: freshQuoteForCart.widthIn,
      heightIn: freshQuoteForCart.heightIn,
      quantity: freshQuoteForCart.quantity,
      material: freshQuoteForCart.material,
      grommets: freshQuoteForCart.grommets, // CRITICAL: Use fresh grommets value
      polePockets: freshQuoteForCart.polePockets,
      polePocketSize: freshQuoteForCart.polePocketSize,
      addRope: freshQuoteForCart.addRope,
      previewScalePct: freshQuoteForCart.previewScalePct,
      textElements: freshQuoteForCart.textElements,
      overlayImage: currentOverlayImage, // BUG 3 FIX: Use extracted overlay image
      canvasBackgroundColor: canvasBackgroundColor,
      // CRITICAL: Pass original file (if exists) for background, thumbnailUrl for cart preview
      // If there are text elements, DON'T pass file (thumbnail has text baked in)
      file: (freshQuoteForCart.textElements && freshQuoteForCart.textElements.length > 0) ? undefined : freshQuoteForCart.file,
      thumbnailUrl: thumbnailUrl,
    };
    
    console.log('�� [ADD TO CART] Quote data:', quoteData);
    console.log('📦 [ADD TO CART] Thumbnail URL type:', typeof thumbnailUrl);
    console.log('📦 [ADD TO CART] Thumbnail URL value:', thumbnailUrl);
    
    // Show upsell modal if user should see it
    if (shouldShowUpsell && !editingItemId) {
      console.log('🎨 BANNER EDITOR: Showing upsell modal for ADD TO CART');
      console.log('🎨 BANNER EDITOR: canvasThumbnail:', canvasThumbnail ? canvasThumbnail.substring(0, 50) + '...' : 'NULL');
      setPendingAction('cart');
      setShowUpsellModal(true);
      return;
    }
    
    // BUG 3A FIX: Skip upsell when updating existing items
    if (editingItemId && shouldShowUpsell) {
      console.log('🔄 [BUG 3A FIX] Skipping upsell modal because editing existing item:', editingItemId);
    }

    // CRITICAL: Update existing item if editing, otherwise add new item
    if (editingItemId) {
      console.log('🔄 [UPDATE CART] Updating existing item:', editingItemId);
      updateCartItem(editingItemId, quoteData as any, undefined, pricing);
      toast({
        title: "Cart Updated",
        description: "Your banner has been updated in the cart.",
      });
    } else {
      console.log('➕ [ADD TO CART] Adding new item to cart');
      addFromQuote(quoteData as any, undefined, pricing);
      toast({
        title: "Added to Cart",
        description: "Your banner has been added to the cart.",
      });
    }
    
    // Clear uploaded images from AssetsPanel after successful add to cart
    window.dispatchEvent(new Event('clearUploadedImages'));
      
    // Scroll to top so user can see the cart
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Reset design area after successful add
    console.log('🔄 RESET: About to call resetDesign() after add to cart');
    resetDesign();
    console.log('🔄 RESET: resetDesign() called');
  };

  const handleUpsellContinue = async (selectedOptions: UpsellOption[], dontAskAgain: boolean) => {
    console.log("[BannerEditorLayout] handleUpsellContinue called with:", { selectedOptions, dontAskAgain, pendingAction });

    // Save "don't ask again" preference
    if (dontAskAgain) {
      localStorage.setItem('upsell-dont-show-again', 'true');
      setDontShowUpsellAgain(true);
    }

    // CRITICAL: Apply grommet selection to canvas BEFORE generating thumbnail
    const grommetOption = selectedOptions.find(opt => opt.id === 'grommets' && opt.selected);
    if (grommetOption && grommetOption.grommetSelection) {
      console.log('🔄 [BUG 1 FIX] Applying grommets to canvas:', grommetOption.grommetSelection);
      console.log('🔄 [BUG 1 FIX] Current showGrommets before:', showGrommets);
      setShowGrommets(true);
      setGrommets(grommetOption.grommetSelection as any);
      console.log('🔄 [BUG 1 FIX] Set showGrommets to true and grommets to:', grommetOption.grommetSelection);
      // Wait LONGER for canvas to fully re-render with grommets (increased from 150ms to 500ms)
      console.log('⏳ [BUG 1 FIX] Waiting 500ms for canvas to render grommets...');
      await new Promise(resolve => setTimeout(resolve, 500));
      console.log('✅ [BUG 1 FIX] Canvas should now have grommets visible');
    }

    // BUG 1 FIX: Force fresh thumbnail generation AFTER grommets are applied
    const freshQuote = useQuoteStore.getState();
    console.log('🔄 [BUG 1 FIX] About to generate thumbnail. showGrommets:', showGrommets, 'grommets (fresh):', freshQuote.grommets);
    console.log('🔄 [BUG 1 FIX] Editor objects count:', editorObjects.length);
    generateThumbnail();
    // Wait for thumbnail to be generated and stored (generateThumbnail has 200ms internal delay)
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // BUG 1 FIX: Get FRESH thumbnail from store after generation
    const freshThumbnail = useEditorStore.getState().canvasThumbnail;
    console.log('✅ [BUG 1 FIX] Fresh thumbnail generated. Length:', freshThumbnail?.length);
    console.log('✅ [BUG 1 FIX] Old canvasThumbnail length:', canvasThumbnail?.length);

    // Generate thumbnail for cart preview - USE FRESH THUMBNAIL
    let thumbnailUrl = freshThumbnail;
    
    // Fallback to file URL if canvas thumbnail not available
    if (!thumbnailUrl && file && file.url) {
      thumbnailUrl = file.url;
    }
    // Fallback to first image object if still no thumbnail
    else if (!thumbnailUrl && editorObjects.length > 0) {
      const firstImage = editorObjects.find(obj => obj.type === 'image');
      if (firstImage && firstImage.url) {
        thumbnailUrl = firstImage.url;
      }
    }
    
    console.log('[BannerEditorLayout] Upsell - Using thumbnail URL:', thumbnailUrl ? thumbnailUrl.substring(0, 50) + '...' : 'null');

    // Build updated quote object with selected options
    // CRITICAL: Convert editor text objects to textElements format for cart storage
    const textElementsFromEditor = editorObjects
      .filter(obj => obj.type === 'text')
      .map(obj => ({
        id: obj.id,
        content: obj.content || '',
        xPercent: (obj.x / widthIn) * 100,
        yPercent: (obj.y / heightIn) * 100,
        fontSize: obj.fontSize || 24,
        fontFamily: obj.fontFamily || 'Arial',
        color: obj.color || '#000000',
        fontWeight: (obj.fontWeight || 'normal') as 'normal' | 'bold',
        fontStyle: (obj.fontStyle || 'normal') as 'normal' | 'italic',
        textDecoration: obj.textDecoration || '',
        textAlign: (obj.textAlign || 'left') as 'left' | 'center' | 'right',
        align: obj.align || 'left',
        lineHeight: obj.lineHeight || 1.2,
        rotation: obj.rotation || 0,
      }));
    
    let updatedQuote = {
      widthIn: quote.widthIn,
      heightIn: quote.heightIn,
      quantity: quote.quantity,
      material: quote.material,
      grommets: quote.grommets,
      polePockets: quote.polePockets,
      polePocketSize: quote.polePocketSize,
      addRope: quote.addRope,
      previewScalePct: quote.previewScalePct,
      textElements: textElementsFromEditor.length > 0 ? textElementsFromEditor : quote.textElements,
      overlayImage: quote.overlayImage,
      canvasBackgroundColor: canvasBackgroundColor,
      file: undefined,
      thumbnailUrl: thumbnailUrl,
    };

    // Apply selected upsell options
    selectedOptions.forEach(option => {
      if (option.id === 'grommets-every-2ft') {
        updatedQuote.grommets = 'Grommets every 2-3ft';
      } else if (option.id === 'rope') {
        updatedQuote.addRope = true;
      } else if (option.id === 'pole-pockets') {
        updatedQuote.polePockets = 'Yes';
        updatedQuote.polePocketSize = '2.5"';
      }
    });

    // Calculate pricing with upsells
    const sqft = (widthIn * heightIn) / 144;
    const basePrice = material === '13oz Vinyl' ? 3.50 : 4.50;
    const unitPrice = sqft * basePrice;
    const ropePrice = updatedQuote.addRope ? 15 : 0;
    const polePocketPrice = updatedQuote.polePockets === 'Yes' ? 25 : 0;
    const lineTotal = (unitPrice + ropePrice + polePocketPrice) * quote.quantity;
    
    const pricing = {
      unit_price_cents: Math.round(unitPrice * 100),
      rope_cost_cents: Math.round(ropePrice * 100),
      rope_pricing_mode: 'per_item' as const,
      pole_pocket_cost_cents: Math.round(polePocketPrice * 100),
      pole_pocket_pricing_mode: 'per_item' as const,
      line_total_cents: Math.round(lineTotal * 100),
    };

    // CRITICAL: Update existing item if editing, otherwise add new item
    if (editingItemId) {
      console.log('🔄 [UPDATE CART UPSELL] Updating existing item:', editingItemId);
      updateCartItem(editingItemId, updatedQuote as any, undefined, pricing);
      toast({
        title: "Cart Updated",
        description: "Your banner has been updated in the cart with selected options.",
      });
    } else {
      console.log('➕ [ADD TO CART UPSELL] Adding new item to cart');
      addFromQuote(updatedQuote as any, undefined, pricing);
      toast({
        title: "Added to Cart",
        description: "Your banner has been added to the cart.",
      });
    }
    
    // Clear uploaded images
    window.dispatchEvent(new Event('clearUploadedImages'));
    
    // Close modal
    setShowUpsellModal(false);
    setPendingAction(null);
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Reset design
    console.log('🔄 RESET: About to call resetDesign() after upsell');
    resetDesign();
    console.log('🔄 RESET: resetDesign() called');
  };

  const handleUpsellClose = () => {
    setShowUpsellModal(false);
    setPendingAction(null);
  };

  const togglePanel = (panelId: PanelType) => {
    setActivePanel(activePanel === panelId ? null : panelId);
  };

  // Define sidebar button configuration (without components to avoid stale closures)
  const sidebarButtons = [
    {
      id: 'uploads' as PanelType,
      icon: <Upload className="w-6 h-6" />,
      label: 'Uploads',
    },
    {
      id: 'text' as PanelType,
      icon: <Type className="w-6 h-6" />,
      label: 'Text',
    },
    {
      id: 'material' as PanelType,
      icon: <Settings className="w-6 h-6" />,
      label: 'Material',
    },
    {
      id: 'size' as PanelType,
      icon: <Maximize2 className="w-6 h-6" />,
      label: 'Size/Quantity',
    },
    {
      id: 'options' as PanelType,
      icon: <Wrench className="w-6 h-6" />,
      label: 'Options',
    },

    {
      id: 'inspector' as PanelType,
      icon: <Eye className="w-6 h-6" />,
      label: 'Inspector',
    },
    {
      id: 'colors' as PanelType,
      icon: <Palette className="w-6 h-6" />,
      label: 'Colors',
    },
    {
      id: 'canvas' as PanelType,
      icon: <Sliders className="w-6 h-6" />,
      label: 'Canvas',
    },
  ];

  // Render the active panel component dynamically to avoid stale closures
  const renderPanelContent = (panelId: PanelType) => {
    console.log('[BannerEditorLayout] Rendering panel:', panelId);
    const handleClosePanel = () => setActivePanel(null);
    switch (panelId) {
      case 'uploads':
        return <AssetsPanel onClose={handleClosePanel} />;
      case 'text':
        return <TextPanel onClose={handleClosePanel} />;
      case 'material':
        return <MaterialCard />;
      case 'size':
        return <SizeQuantityCard />;
      case 'options':
        return <OptionsCard />;

      case 'inspector':
        return <ObjectInspector selectedObjectId={selectedObjectId} />;
      case 'colors':
        return <BrandColorsPanel selectedObjectId={selectedObjectId} />;
      case 'canvas':
        return <CanvasSettingsPanel />;
      default:
        return null;
    }
  };

  const activePanelData = sidebarButtons.find(btn => btn.id === activePanel);

  return (
    <>
    <div className="flex flex-col h-screen bg-gradient-to-br from-gray-50 to-gray-100">


      {/* Professional Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm z-20">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Palette className="w-6 h-6 text-[#18448D]" />
            <div>
              <h1 className="text-lg font-bold text-gray-900">Banner Designer</h1>
              <p className="text-xs text-gray-500 hidden sm:block">Professional design tool</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {import.meta.env.VITE_AI_BANNER_ENABLED !== 'false' && (
              <Button
                onClick={handleAIGenerate}
                variant="outline"
                size="sm"
                className="hidden sm:flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                AI Generate
              </Button>
            )}
            <Button
              onClick={() => handleExport('png')}
              variant="outline"
              size="sm"
              className="hidden sm:flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export
            </Button>
            <Button
              onClick={handlePreview}
              size="sm"
              className="bg-[#18448D] hover:bg-[#0f2d5c] text-white"
            >
              <Eye className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Preview</span>
            </Button>
            <Button
              onClick={handleAddToCart}
              disabled={!hasContent}
              size="sm"
              className="bg-[#18448D] hover:bg-[#0f2d5c] text-white"
            >
              <ShoppingCart className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">{editingItemId ? 'Update Cart' : 'Add to Cart'}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative isolate">
        
        {/* Left Sidebar - Icon Only (Desktop) */}
        <div className="hidden lg:flex flex-col bg-white border-r border-gray-200 w-20 z-10">
          <div className="flex-1 flex flex-col py-4 gap-1">
            {sidebarButtons.map((button) => (
              <button
                key={button.id}
                data-sidebar-button
                onClick={() => togglePanel(button.id)}
                className={`flex flex-col items-center justify-center py-4 px-2 transition-all duration-200 relative group ${
                  activePanel === button.id
                    ? 'text-[#18448D] bg-blue-50'
                    : 'text-gray-600 hover:text-[#18448D] hover:bg-gray-50'
                }`}
                title={button.label}
              >
                {button.icon}
                <span className="text-xs mt-1 font-medium">{button.label.split('/')[0]}</span>
                {activePanel === button.id && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#18448D]" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Expanded Panel (Desktop) - Overlays Canvas */}
        {activePanel && activePanelData && (
          <div
            ref={desktopPanelRef}
            className="hidden lg:block absolute left-20 top-0 bottom-0 w-96 bg-white border-r border-gray-200 shadow-xl z-30 animate-slide-in pointer-events-auto"
            style={{
              animation: 'slideIn 250ms ease-out'
            }}
          >
            <div className="h-full flex flex-col">
              {/* Panel Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">{activePanelData.label}</h2>
                <button
                  onClick={() => setActivePanel(null)}
                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              
              {/* Panel Content */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden p-4">
                {activePanel && renderPanelContent(activePanel)}
              </div>
            </div>
          </div>
        )}

        {/* Canvas Area - Full Width */}
        <div className="flex-1 flex flex-col bg-gray-100 overflow-hidden relative z-0">
          <div className="flex-1 p-4 overflow-auto">
            <EditorCanvas 
              ref={canvasRef}
              selectedObjectId={selectedObjectId}
              onSelectObject={setSelectedObjectId}
            />
          </div>
        </div>

        {/* Mobile Bottom Toolbar */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-20">
          <div className="flex overflow-x-auto">
            {sidebarButtons.map((button) => (
              <button
                key={button.id}
                data-sidebar-button
                onClick={() => togglePanel(button.id)}
                className={`flex-shrink-0 flex flex-col items-center justify-center py-3 px-4 min-w-[80px] transition-all duration-200 ${
                  activePanel === button.id
                    ? 'text-[#18448D] bg-blue-50 border-t-2 border-[#18448D]'
                    : 'text-gray-600 hover:text-[#18448D] hover:bg-gray-50'
                }`}
              >
                {button.icon}
                <span className="text-xs mt-1 font-medium truncate w-full text-center">
                  {button.label.split('/')[0]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Mobile Expanded Panel - Slides Up from Bottom */}
        {activePanel && activePanelData && (
          <div
            ref={mobilePanelRef}
            className="lg:hidden fixed inset-x-0 bottom-0 bg-white border-t border-gray-200 shadow-2xl z-40 animate-slide-up"
            style={{
              height: '70vh',
              animation: 'slideUp 250ms ease-out'
            }}
          >
            <div className="h-full flex flex-col">
              {/* Panel Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">{activePanelData.label}</h2>
                <button
                  onClick={() => setActivePanel(null)}
                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              
              {/* Panel Content */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden p-4">
                {activePanel && renderPanelContent(activePanel)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CSS Animations */}
      <style jsx>{`
        @keyframes slideIn {
          from {
            transform: translateX(-100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @keyframes slideUp {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .animate-slide-in {
          animation: slideIn 250ms ease-out;
        }

        .animate-slide-up {
          animation: slideUp 250ms ease-out;
        }
      `}</style>
    </div>
    
    {/* Preview Modal */}
    <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-[#18448D]">
              Banner Preview
            </DialogTitle>
          </DialogHeader>

          <div className="mt-4">
            <div className="bg-gray-100 p-4 rounded-lg">
              <img
                src={canvasThumbnail || ''}
                alt="Banner Preview"
                className="w-full h-auto rounded shadow-lg"
              />
            </div>

            <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h3 className="font-semibold text-gray-900 mb-2">Banner Details</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-600">Size:</span>{' '}
                  <span className="font-medium">{widthIn}" × {heightIn}"</span>
                </div>
                <div>
                  <span className="text-gray-600">Material:</span>{' '}
                  <span className="font-medium">{material}</span>
                </div>
                <div>
                  <span className="text-gray-600">Grommets:</span>{' '}
                  <span className="font-medium">{grommets}</span>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <UpsellModal
        isOpen={showUpsellModal}
        onClose={handleUpsellClose}
        quote={quote}
        thumbnailUrl={canvasThumbnail || undefined}
        onContinue={handleUpsellContinue}
        actionType={pendingAction || 'cart'}
      />

    </>
  );
};

export default BannerEditorLayout;
