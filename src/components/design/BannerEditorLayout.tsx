import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth, isAdmin } from '@/lib/auth';
import { grommetPoints, grommetRadius } from '@/lib/preview/grommets';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { uploadCanvasImageToCloudinary } from '@/utils/uploadCanvasImage';
import { useEditorStore } from '@/store/editor';
import { useQuoteStore } from '@/store/quote';
import { generateFinalRender } from '@/utils/generateFinalRender';
import { useCartStore } from '@/store/cart';
import UpsellModal, { UpsellOption } from '@/components/cart/UpsellModal';
import { 
  Upload, 
  Type, 
  Settings, 
  Maximize2, 
  Wrench,
  ShoppingCart,
  CreditCard,
  Eye,
  Palette, 
  Sliders,
  Download, 
  Sparkles,
  X,
  Grid3X3
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
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdminUser = user && isAdmin(user);
  const { exportToJSON, setCanvasThumbnail, canvasThumbnail, objects: editorObjects, addObject, reset: resetEditor, canvasBackgroundColor, showGrommets, setShowGrommets, showGrid, setShowGrid } = useEditorStore();
  const quote = useQuoteStore();
  const { set: setQuote, editingItemId, overlayImage, textElements, file, grommets, widthIn, heightIn, material, resetDesign } = quote;

  // Calculate grommet positions for preview overlay
  const grommetPositions = useMemo(() => {
    return grommetPoints(widthIn, heightIn, grommets);
  }, [widthIn, heightIn, grommets]);

  const grommetR = useMemo(() => {
    return grommetRadius(widthIn, heightIn);
  }, [widthIn, heightIn]);
  
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
      // Don't interfere with file inputs
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'file') return;
      if (target.closest('label')?.querySelector('input[type="file"]')) return;
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
  const generateThumbnail = async () => {
    // Skip if we already have a Cloudinary thumbnail (from Canva import)
    // This prevents overwriting the high-quality Canva export with a canvas-generated thumbnail
    const currentThumbnail = useEditorStore.getState().canvasThumbnail;
    if (currentThumbnail && currentThumbnail.includes('cloudinary')) {
      console.log('[THUMBNAIL] Skipping generation - already have Cloudinary thumbnail from Canva:', currentThumbnail.substring(0, 60));
      return currentThumbnail;
    }

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
      
      // CRITICAL: Clear selection to hide transformer boxes before generating thumbnail
      if (editorState.clearSelection) {
        editorState.clearSelection();
      }
      
      // Get the layer
      const layer = stage.getLayers()[0];
      if (!layer) {
        console.error('[BannerEditorLayout] No layer found');
        return null;
      }
      
      // FIX: Use direct Konva node manipulation to hide guides WITHOUT React re-render
      // This prevents the visual flash when generating thumbnails
      const bleedNode = layer.findOne('.bleed-guide');
      const safezoneNode = layer.findOne('.safezone-guide');
      const gridNode = layer.findOne('.grid-guide');
      const grommetNode = layer.findOne('.grommet-guide');
      const transformerNode = layer.findOne('Transformer');
      
      // Store original visibility
      const bleedWasVisible = bleedNode?.visible() ?? false;
      const safezoneWasVisible = safezoneNode?.visible() ?? false;
      const gridWasVisible = gridNode?.visible() ?? false;
      const grommetWasVisible = grommetNode?.visible() ?? false;
      const transformerWasVisible = transformerNode?.visible() ?? false;
      
      // Hide guides directly on Konva nodes (no React re-render, no visual flash)
      bleedNode?.visible(false);
      safezoneNode?.visible(false);
      gridNode?.visible(false);
      grommetNode?.visible(false);
      transformerNode?.visible(false);
      
      // Force immediate redraw with hidden guides
      layer.batchDraw();
      
      // Use requestAnimationFrame for a single frame delay (faster than setTimeout)
      requestAnimationFrame(async () => {
        try {
          // Get the layer to find the banner bounds
          // Re-get layer reference (we already validated it exists before requestAnimationFrame)
          const currentLayer = stage.getLayers()[0];
          if (!currentLayer) {
            console.error('[BannerEditorLayout] No layer found');
            return;
          }

          // Get the background rect (first child) to find banner position
          const backgroundRect = layer.getChildren()[0];
          if (!backgroundRect) {
            console.error('[BannerEditorLayout] No background rect found');
            // Restore visibility on Konva nodes directly (no React re-render flash)
            bleedNode?.visible(bleedWasVisible);
            safezoneNode?.visible(safezoneWasVisible);
            gridNode?.visible(gridWasVisible);
            grommetNode?.visible(grommetWasVisible);
            transformerNode?.visible(transformerWasVisible);
            layer.batchDraw();
            return;
          }

          // Get the actual position and size of the background rect
          // This gives us the banner area bounds
          const x = backgroundRect.x();
          const y = backgroundRect.y();
          const width = backgroundRect.width();
          const height = backgroundRect.height();
          
          console.log('[BannerEditorLayout] Banner bounds:', { x, y, width, height });

          // Check if all images are loaded
          const imageNodes = layer.find('Image');
          console.log('[THUMBNAIL] Found', imageNodes.length, 'image nodes on layer');
          
          // Also check what objects are in the editor store
          const editorState = useEditorStore.getState();
          const imageObjects = editorState.objects.filter(obj => obj.type === 'image');
          console.log('[THUMBNAIL] Editor store has', imageObjects.length, 'image objects');
          imageObjects.forEach((obj, idx) => {
            console.log(`[THUMBNAIL] Store image ${idx}:`, {
              url: obj.url?.substring(0, 80),
              urlType: obj.url?.startsWith('blob:') ? 'BLOB' : obj.url?.startsWith('http') ? 'HTTP' : 'OTHER',
              cloudinaryId: obj.cloudinaryPublicId,
              x: obj.x,
              y: obj.y,
              width: obj.width,
              height: obj.height
            });
          });
          
          let allImagesLoaded = true;
          imageNodes.forEach((node, idx) => {
            const img = node.image();
            const isLoaded = img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0;
            const src = img instanceof HTMLImageElement ? img.src : 'N/A';
            console.log(`[THUMBNAIL] Canvas image ${idx}:`, {
              loaded: isLoaded,
              src: src?.substring(0, 80),
              srcType: src?.startsWith('blob:') ? 'BLOB' : src?.startsWith('http') ? 'HTTP' : 'OTHER',
              complete: img instanceof HTMLImageElement ? img.complete : false,
              naturalWidth: img instanceof HTMLImageElement ? img.naturalWidth : 0,
              naturalHeight: img instanceof HTMLImageElement ? img.naturalHeight : 0
            });
            if (!isLoaded) allImagesLoaded = false;
          });
          
          if (!allImagesLoaded) {
            console.log('[THUMBNAIL] Not all images loaded yet, will retry...');
            
            // Track retry count to avoid infinite loop
            const retryCount = (generateThumbnail as any).retryCount || 0;
            (generateThumbnail as any).retryCount = retryCount + 1;
            
            if (retryCount < 10) {
              // Exponential backoff: 100ms, 200ms, 400ms, 800ms, then 1000ms
              const delay = Math.min(100 * Math.pow(2, retryCount), 1000);
              console.log(`[THUMBNAIL] Retry ${retryCount + 1}/10 in ${delay}ms...`);
              setTimeout(() => generateThumbnail(), delay);
            } else {
              console.error('[THUMBNAIL] Failed to load images after 10 retries, generating thumbnail anyway');
              (generateThumbnail as any).retryCount = 0;
              // Continue to generate thumbnail even with unloaded images
            }
            
            // Restore visibility on Konva nodes directly (no React re-render flash)
            bleedNode?.visible(bleedWasVisible);
            safezoneNode?.visible(safezoneWasVisible);
            gridNode?.visible(gridWasVisible);
            grommetNode?.visible(grommetWasVisible);
            transformerNode?.visible(transformerWasVisible);
            layer.batchDraw();
            
            if (retryCount >= 10) {
              // Don't return, let it continue to generate thumbnail
            } else {
              return;
            }
          } else {
            // Reset retry count on success
            (generateThumbnail as any).retryCount = 0;
          }

          // Capture thumbnail using stage.toDataURL
          let dataURL: string | null = null;
          
          try {
            dataURL = stage.toDataURL({
              x: x,
              y: y,
              width: width,
              height: height,
              pixelRatio: 2,
              mimeType: 'image/png',
            });
            
            console.log('[BannerEditorLayout] stage.toDataURL succeeded, size:', dataURL.length);
            
            // Check if it's a blank image (very small size)
            if (dataURL.length < 2200) {
              console.warn('[THUMBNAIL] Generated image is suspiciously small, might be blank');
              console.log('[THUMBNAIL] Attempting server-side thumbnail generation...');
              
              // Use server-side thumbnail generation for mobile
              try {
                const response = await fetch('/.netlify/functions/generate-thumbnail', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    objects: editorState.objects,
                    backgroundColor: canvasBackgroundColor,
                    width: width,
                    height: height
                  })
                });
                
                if (response.ok) {
                  const result = await response.json();
                  if (result.success && result.thumbnailUrl) {
                    console.log('[THUMBNAIL] Server-side thumbnail generated:', result.method);
                    dataURL = result.thumbnailUrl;
                  }
                }
              } catch (serverError) {
                console.error('[THUMBNAIL] Server-side generation failed:', serverError);
              }
            }
          } catch (error) {
            console.error('[THUMBNAIL] stage.toDataURL failed:', error);
            console.log('[THUMBNAIL] This usually means CORS/tainted canvas - trying canvas fallback');
            
            // Fallback: Create a simple thumbnail with just the background color
            // This is better than nothing
            const canvas = document.createElement('canvas');
            canvas.width = width * 2;
            canvas.height = height * 2;
            const ctx = canvas.getContext('2d');
            
            if (ctx) {
              ctx.fillStyle = canvasBackgroundColor || '#ffffff';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              
              // Try to draw a simple message
              ctx.fillStyle = '#666666';
              ctx.font = '24px Arial';
              ctx.textAlign = 'center';
              ctx.fillText('Preview unavailable', canvas.width / 2, canvas.height / 2);
              ctx.font = '16px Arial';
              ctx.fillText('(CORS issue on mobile)', canvas.width / 2, canvas.height / 2 + 30);
              
              dataURL = canvas.toDataURL('image/png');
              console.log('[THUMBNAIL] Created fallback thumbnail');
            }
          }
          
          if (dataURL) {
            console.log('[BannerEditorLayout] Generated thumbnail:', dataURL.substring(0, 50) + '...', 'size:', dataURL.length);
            setCanvasThumbnail(dataURL);
          } else {
            console.error('[THUMBNAIL] Failed to generate thumbnail');
          }

          
          // Restore original visibility
          // Restore visibility on Konva nodes directly (no React re-render flash)
          bleedNode?.visible(bleedWasVisible);
          safezoneNode?.visible(safezoneWasVisible);
          gridNode?.visible(gridWasVisible);
          grommetNode?.visible(grommetWasVisible);
          transformerNode?.visible(transformerWasVisible);
          layer.batchDraw();
        } catch (error) {
          console.error('[BannerEditorLayout] Error generating thumbnail:', error);
          // Restore visibility even on error
          // Restore visibility on Konva nodes directly (no React re-render flash)
          bleedNode?.visible(bleedWasVisible);
          safezoneNode?.visible(safezoneWasVisible);
          gridNode?.visible(gridWasVisible);
          grommetNode?.visible(grommetWasVisible);
          transformerNode?.visible(transformerWasVisible);
          layer.batchDraw();
        }
      }, 100); // Wait 100ms for React to re-render
      
      return null;
    } catch (error) {
      console.error('[BannerEditorLayout] Error generating thumbnail:', error);
      return null;
    }
  };



  // Auto-generate thumbnail when canvas content changes
  useEffect(() => {
    // Skip if we already have a Cloudinary thumbnail (from Canva import)
    // This prevents overwriting the high-quality Canva export with a canvas-generated thumbnail
    if (canvasThumbnail && canvasThumbnail.includes('cloudinary')) {
      console.log('[THUMBNAIL] Skipping regeneration - already have Cloudinary thumbnail from Canva');
      return;
    }
    
    // Debounce thumbnail generation to avoid too many updates
    const timeoutId = setTimeout(() => {
      generateThumbnail();
    }, 800); // Wait 800ms after last change to give images time to load on mobile

    return () => clearTimeout(timeoutId);
  }, [editorObjects, canvasBackgroundColor, grommets, showGrommets, canvasThumbnail]); // Re-generate when objects, background, or grommets change


  // Check for Canva design import from sessionStorage
  useEffect(() => {
    const canvaDesignUrl = sessionStorage.getItem('canva-design-url');
    const canvaDesignName = sessionStorage.getItem('canva-design-name');
    const canvaDesignPublicId = sessionStorage.getItem('canva-design-publicId');
    const canvaDesignId = sessionStorage.getItem('canva-design-id');
    
    if (canvaDesignUrl) {
      console.log('🎨 [CANVA IMPORT] Found Canva design in sessionStorage:', { canvaDesignUrl, canvaDesignName });
      
      // Clear sessionStorage immediately to prevent re-importing
      sessionStorage.removeItem('canva-design-url');
      sessionStorage.removeItem('canva-design-name');
      sessionStorage.removeItem('canva-design-publicId');
      sessionStorage.removeItem('canva-design-id');
      
      // Create an Image to get dimensions
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const aspectRatio = img.width / img.height;
        // For Canva imports, fill the canvas (user designed for full banner size)
        // Use 95% of canvas width to leave small margin
        const defaultWidth = widthIn * 0.95;
        const height = defaultWidth / aspectRatio;
        
        // If height exceeds canvas, scale down to fit
        const finalWidth = height > heightIn * 0.95 ? (heightIn * 0.95) * aspectRatio : defaultWidth;
        const finalHeight = height > heightIn * 0.95 ? heightIn * 0.95 : height;
        
        console.log('🎨 [CANVA IMPORT] Adding image to canvas:', { width: defaultWidth, height, aspectRatio });
        
        // Add the image to the canvas
        addObject({
          type: 'image',
          url: canvaDesignUrl,
          cloudinaryPublicId: canvaDesignPublicId || undefined,
          name: canvaDesignName || 'Canva Design',
          x: widthIn / 2,
          y: heightIn / 2,
          width: finalWidth,
          height: finalHeight,
          rotation: 0,
          opacity: 1,
          visible: true,
          locked: false,
        });
        
        // Also set it as the file in quote store for thumbnail
        setQuote({
          file: {
            url: canvaDesignUrl,
            name: canvaDesignName || 'Canva Design',
            type: 'image/png',
          },
          overlayImage: {
            url: canvaDesignUrl,
            name: canvaDesignName || 'Canva Design',
            scale: 1,
            aspectRatio: aspectRatio,
            position: { x: 50, y: 50 },
          },
        });
        
        // Set the Canva image URL directly as thumbnail (faster than waiting for canvas render)
        setCanvasThumbnail(canvaDesignUrl);
        
        // Store Canva design ID in quote store for re-editing capability
        if (canvaDesignId) {
          setQuote({ canvaDesignId });
          console.log('🎨 [CANVA IMPORT] Stored Canva design ID:', canvaDesignId);
        }
        
        // Open upsell modal after a short delay
        setTimeout(() => {
          console.log('🎨 [CANVA IMPORT] Opening upsell modal');
          setPendingAction('cart');
          setShowUpsellModal(true);
        }, 300);
      };
      img.onerror = () => {
        console.error('🎨 [CANVA IMPORT] Failed to load image:', canvaDesignUrl);
        toast({
          title: 'Import Failed',
          description: 'Could not load your Canva design. Please try again.',
          variant: 'destructive',
        });
      };
      img.src = canvaDesignUrl;
    }
  }, []); // Run once on mount
  // Load cart item objects into canvas when editing
  useEffect(() => {
    if (!editingItemId) {
      // CRITICAL FIX: Reset tracking state when not editing
      const currentState = useQuoteStore.getState();
      if (currentState.loadedItemId !== null) {
        console.log('[BannerEditorLayout] Clearing edit mode - resetting tracking state');
        setQuote({ loadedItemId: null, isLoadingItem: false });
      }
      console.log('[BannerEditorLayout] Not editing, skipping object load');
      return;
    }

    // CRITICAL FIX: Prevent duplicate loading of the same item
    const currentState = useQuoteStore.getState();
    if (currentState.loadedItemId === editingItemId) {
      console.log('[BannerEditorLayout] Already loaded this item, skipping:', editingItemId);
      return;
    }

    // CRITICAL FIX: Prevent concurrent loading
    if (currentState.isLoadingItem) {
      console.log('[BannerEditorLayout] Already loading, skipping duplicate load');
      return;
    }

    // CRITICAL FIX: Read values directly from store to ensure we have the latest state
    const currentQuote = useQuoteStore.getState();
    const currentOverlayImage = currentQuote.overlayImage;
    const currentOverlayImages = currentQuote.overlayImages; // NEW: Support multiple images
    const currentTextElements = currentQuote.textElements;
    const currentFile = currentQuote.file;
    const currentGrommets = currentQuote.grommets;
    const currentWidthIn = currentQuote.widthIn;
    const currentHeightIn = currentQuote.heightIn;
    
    console.log('🔄 [CART EDIT] useEffect triggered:', { 
      editingItemId, 
      hasOverlayImage: !!currentOverlayImage, 
      hasOverlayUrl: !!currentOverlayImage?.url, 
      hasTextElements: !!currentTextElements?.length, 
      hasFile: !!currentFile,
      overlayImageUrl: currentOverlayImage?.url?.substring(0, 50)
    });
    console.log('🔍 [DEBUG] currentOverlayImage FULL:', currentOverlayImage);
    console.log('🔍 [DEBUG] currentFile FULL:', currentFile);
    console.log('🔍 [DEBUG] currentTextElements:', currentTextElements);
    console.log('🔍 [DEBUG] currentGrommets:', currentGrommets);
    console.log('🔍 [DEBUG] currentOverlayImage FULL:', currentOverlayImage);
    console.log('🔍 [DEBUG] currentFile FULL:', currentFile);
    console.log('🔍 [DEBUG] currentTextElements:', currentTextElements);
    console.log('🔍 [DEBUG] currentGrommets:', currentGrommets);

    // Only load if we have objects to load
    const hasObjectsToLoad = (currentOverlayImage && currentOverlayImage.url) || (currentOverlayImages && currentOverlayImages.length > 0) || (currentTextElements && currentTextElements.length > 0) || (currentFile && currentFile.url);
    
    if (!hasObjectsToLoad) {
      console.log('[BannerEditorLayout] No objects to load from cart item');
      return;
    }

    console.log('[BannerEditorLayout] Loading cart item objects for editing:', { editingItemId, overlayImage, textElements });
    console.log('[BannerEditorLayout] Current editor objects before load:', editorObjects);

    // CRITICAL: Clear existing objects first to prevent duplicates
    console.log('[BannerEditorLayout] Clearing existing objects before loading cart item');
    resetEditor(); // Actually clear the canvas objects

    // CRITICAL FIX: Mark as loading and track which item we're loading
    setQuote({ isLoadingItem: true, loadedItemId: editingItemId });

    // CRITICAL FIX: Increased delay to ensure reset completes before adding objects (was 100ms, now 250ms)
    setTimeout(() => {
      // CRITICAL FIX: Set grommets visibility AFTER reset completes
      const shouldShowGrommets = currentGrommets && currentGrommets !== 'none';
      console.log('[BannerEditorLayout] Setting grommets visibility:', shouldShowGrommets, 'grommets:', currentGrommets);
      setShowGrommets(shouldShowGrommets);
      
      // CRITICAL FIX: Load background file if it exists
      // Now that file.url is reconstructed from file_key (not the thumbnail),
      // we can safely load it as the background layer
      
      console.log('[BannerEditorLayout] Loading elements:', {
        hasFile: !!currentFile,
        fileUrl: currentFile?.url?.substring(0, 60),
        hasTextElements: !!currentTextElements?.length,
        hasOverlayImage: !!currentOverlayImage,
      });
      
      // Load background file if present
      if (currentFile && currentFile.url) {
        console.log('[BannerEditorLayout] Adding background file to canvas:', currentFile.url.substring(0, 60));
        
        // Calculate dimensions to fit the canvas
        const canvasWidthPx = currentWidthIn * 96; // Convert inches to pixels (96 DPI)
        const canvasHeightPx = currentHeightIn * 96;
        
        // If we have artwork dimensions, use them to calculate proper size
        let imageWidth = canvasWidthPx;
        let imageHeight = canvasHeightPx;
        
        if (currentFile.artworkWidth && currentFile.artworkHeight) {
          const aspectRatio = currentFile.artworkWidth / currentFile.artworkHeight;
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
          url: currentFile.url,
          x: (currentWidthIn - (imageWidth / 96)) / 2, // Center horizontally
          y: (currentHeightIn - (imageHeight / 96)) / 2, // Center vertically
          width: imageWidth / 96, // Convert back to inches
          height: imageHeight / 96,
          rotation: 0,
          opacity: 1,
          locked: false,
          visible: true,
          isPDF: currentFile.isPdf || false,
        });
      }

      // CRITICAL FIX: Load images from single source with simple dedupe
      // Prefer overlayImages (array), fallback to overlayImage (singular)
      const imagesToLoad = currentQuote.overlayImages || (currentQuote.overlayImage ? [currentQuote.overlayImage] : []);
      
      console.log('🖼️ [IMAGE LOAD] Images to load:', imagesToLoad.length);
      
      // Simple dedupe: track loaded fileKeys
      const loadedKeys = [];
      
      imagesToLoad.forEach((overlayImg, index) => {
        const key = overlayImg.fileKey || overlayImg.url;
        if (!key) {
          console.warn('⚠️ [IMAGE LOAD] Skipping image with no key:', overlayImg);
          return;
        }
        
        // Check if already loaded
        if (loadedKeys.indexOf(key) >= 0) {
          console.log(`🚫 [DEDUPE] Skipping duplicate image: ${key.substring(0, 50)}`);
          return;
        }
        
        loadedKeys.push(key);
        console.log(`🖼️ [IMAGE LOAD] Loading image ${index + 1}/${imagesToLoad.length}`, overlayImg);

        // Extract fileKey
        let extractedFileKey = overlayImg.fileKey;
        if (!extractedFileKey && overlayImg.url) {
          const match = overlayImg.url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\?|$)/);
          if (match) extractedFileKey = match[1];
        }
        const originalUrl = extractedFileKey
          ? `https://res.cloudinary.com/dtrxl120u/image/upload/${extractedFileKey}`
          : overlayImg.url;

        // Calculate dimensions - prefer saved dimensions, fallback to scale-based calculation
        let widthInches: number;
        let heightInches: number;

        if (overlayImg.widthIn && overlayImg.heightIn) {
          // Use saved dimensions (most accurate)
          widthInches = overlayImg.widthIn;
          heightInches = overlayImg.heightIn;
        } else {
          // Fallback: calculate from scale and aspect ratio
          const defaultWidthInches = 4;
          const imageScale = overlayImg.scale || 1;
          const aspectRatio = overlayImg.aspectRatio || 1;
          widthInches = defaultWidthInches * imageScale;
          heightInches = widthInches / aspectRatio;
        }

        // Position is stored as TOP-LEFT corner percentage
        // Editor also uses TOP-LEFT, so just convert percentage to inches
        const xInches = overlayImg.position?.x != null ? (overlayImg.position.x / 100) * currentWidthIn : 0;
        const yInches = overlayImg.position?.y != null ? (overlayImg.position.y / 100) * currentHeightIn : 0;

        console.log(`🖼️ [IMAGE LOAD] Position:`, {
          storedPercent: overlayImg.position,
          inches: { x: xInches, y: yInches },
          size: { w: widthInches, h: heightInches }
        });

        addObject({
          type: 'image',
          url: originalUrl,
          cloudinaryPublicId: overlayImg.fileKey,
          name: overlayImg.name,
          x: xInches,
          y: yInches,
          width: widthInches,
          height: heightInches,
          rotation: 0,
          opacity: 1,
          visible: true,
          locked: false,
        });

        console.log(`✅ [IMAGE LOAD] Image ${index + 1} added at (${xInches.toFixed(2)}, ${yInches.toFixed(2)})`)
      });

      // Load text elements if present
      if (currentTextElements && currentTextElements.length > 0) {
        console.log('[BannerEditorLayout] Adding text elements to canvas:', currentTextElements);
        currentTextElements.forEach((textEl: any) => {
          // Convert percentage-based position to inches
          const xInches = textEl.xPercent != null ? (textEl.xPercent / 100) * currentWidthIn : (textEl.x || 0);
          const yInches = textEl.yPercent != null ? (textEl.yPercent / 100) * currentHeightIn : (textEl.y || 0);
          
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
      
      // CRITICAL FIX: Mark loading as complete
      setQuote({ isLoadingItem: false });
      console.log('[BannerEditorLayout] Loading complete for item:', editingItemId);
    }, 250);
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


  // Handle Canva design button
  const handleDesignInCanva = () => {
    console.log('🎨 handleDesignInCanva CALLED in BannerEditorLayout!');
    alert('Canva button clicked in BannerEditorLayout!');
    
    // Check if user is logged in
    if (!user || !user.id) {
      console.error('❌ User not logged in:', user);
      alert('Not logged in - user is: ' + JSON.stringify(user));
      toast({
        title: 'Login Required',
        description: 'Please sign in to use Canva design feature.',
        variant: 'destructive',
      });
      return;
    }
    
    // Generate a temporary order ID
    const tempOrderId = `temp-${Date.now()}`;
    
    // Build the Canva start URL with parameters
    const params = new URLSearchParams({
      orderId: tempOrderId,
      userId: user.id,
      width: widthIn.toString(),
      height: heightIn.toString()
    });
    
    const canvaStartUrl = `/.netlify/functions/canva-start?${params.toString()}`;
    
    console.log('🎨 Opening Canva design session:', { tempOrderId, userId: user.id, widthIn, heightIn });
    console.log('🎨 Redirecting to:', canvaStartUrl);
    alert('Redirecting to: ' + canvaStartUrl);
    
    // Navigate to Canva
    window.location.href = canvaStartUrl;
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

    // PERFORMANCE FIX: Reduced wait time from 300ms to 100ms
    // Thumbnail generation is synchronous, we just need a tick for state update
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log('✅ [UPDATE CART] Fresh thumbnail generated');

    // CRITICAL: Get FRESH thumbnail from store after generation (not stale canvasThumbnail variable)
    const freshThumbnail = useEditorStore.getState().canvasThumbnail;
    console.log('✅ [UPDATE CART] Fresh thumbnail length:', freshThumbnail?.length);
    console.log('⚠️ [UPDATE CART] Old canvasThumbnail length:', canvasThumbnail?.length);

    // Now use the fresh thumbnail from the store
    let thumbnailUrl = freshThumbnail;

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

    // PERFORMANCE FIX: Check if upsell should be shown BEFORE Cloudinary upload
    // This shows the modal immediately instead of waiting for upload
    if (shouldShowUpsell && !editingItemId) {
      console.log('🚀 [FAST UPSELL] Showing upsell modal IMMEDIATELY (before Cloudinary upload)');
      setPendingAction('cart');
      setShowUpsellModal(true);
      return; // Exit early - Cloudinary upload will happen in handleUpsellContinue
    }

    // CRITICAL FIX: Upload thumbnail to Cloudinary for persistence
    // This ensures thumbnails persist after logout/login
    // NOTE: This only runs when upsell is NOT shown (editing or upsell disabled)
    let thumbnailFileKey: string | undefined = undefined;
    if (thumbnailUrl && (thumbnailUrl.startsWith('data:') || thumbnailUrl.startsWith('blob:'))) {
      console.log('📤 [THUMBNAIL UPLOAD] Uploading thumbnail to Cloudinary...');
      try {
        const uploadResult = await uploadCanvasImageToCloudinary(thumbnailUrl, `banner-thumbnail-${Date.now()}.png`);
        thumbnailUrl = uploadResult.secureUrl;
        thumbnailFileKey = uploadResult.fileKey;
        console.log('✅ [THUMBNAIL UPLOAD] Uploaded successfully:', { url: thumbnailUrl, fileKey: thumbnailFileKey });
      } catch (uploadError) {
        console.error('❌ [THUMBNAIL UPLOAD] Failed:', uploadError);
        // Continue with data/blob URL as fallback (will be stripped by cart-save but at least cart works)
      }
    } else if (thumbnailUrl && thumbnailUrl.includes('cloudinary.com')) {
      // Extract fileKey from existing Cloudinary URL
      const match = thumbnailUrl.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/);
      if (match) {
        thumbnailFileKey = match[1];
        console.log('✅ [THUMBNAIL UPLOAD] Using existing Cloudinary URL, fileKey:', thumbnailFileKey);
      }
    }
    
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
    
    // Get overlay image from THREE possible sources:
    // 1. Store's overlayImage (for AI backgrounds with logo overlays)
    // 2. Store's file (for regular uploaded images)
    // 3. Editor's image objects (when editing an existing cart item)
    const freshQuoteForOverlay = useQuoteStore.getState();
    let currentOverlayImage = freshQuoteForOverlay.overlayImage;
    
    // Use imageObjects already extracted above from freshEditorObjects
    
    // NEW: Extract ALL image objects into overlayImages array
    let currentOverlayImages: any[] | undefined = undefined;
    
    if (imageObjects.length === 0) {
      console.log('🗑️ [IMAGE DELETE FIX] No image objects in editor - clearing overlayImages');
      currentOverlayImages = undefined;
      currentOverlayImage = undefined; // Also clear legacy single image
    } else if (imageObjects.length > 0) {
      console.log('🖼️ [MULTI-IMAGE SAVE] Extracting ALL image objects:', imageObjects.length);
      currentOverlayImages = imageObjects.map((overlayObj, index) => {
        // Editor stores x,y as TOP-LEFT corner of the image (in inches)
        // Convert directly to percentage of banner dimensions
        const imageWidthIn = overlayObj.width || 0;
        const imageHeightIn = overlayObj.height || 0;

        // x,y is already top-left, convert to percentage directly
        const xPercent = (overlayObj.x / widthIn) * 100;
        const yPercent = (overlayObj.y / heightIn) * 100;

        const aspectRatio = imageWidthIn && imageHeightIn ? imageWidthIn / imageHeightIn : 1;
        const defaultWidthInches = 4;
        const scale = imageWidthIn ? imageWidthIn / defaultWidthInches : 1;

        const imageData = {
          name: overlayObj.name || `overlay-image-${index + 1}`,
          url: overlayObj.url || '',
          fileKey: overlayObj.cloudinaryPublicId || overlayObj.fileKey || '',
          position: { x: xPercent, y: yPercent },
          scale: scale,
          aspectRatio: aspectRatio,
          // Also save actual dimensions for accurate restoration
          widthIn: imageWidthIn,
          heightIn: imageHeightIn,
        };

        console.log(`🖼️ [MULTI-IMAGE SAVE] Image ${index + 1}:`, imageData);
        console.log(`  - Editor top-left: (${overlayObj.x}, ${overlayObj.y}) inches`);
        console.log(`  - Image size: ${imageWidthIn}x${imageHeightIn} inches`);
        console.log(`  - Saved position: (${xPercent.toFixed(1)}%, ${yPercent.toFixed(1)}%)`);
        return imageData;
      });
      
      // BACKWARD COMPATIBILITY: Also set first image as currentOverlayImage for old code
      currentOverlayImage = currentOverlayImages[0];
    } else if (!currentOverlayImage && freshQuoteForOverlay.file) {
      // Convert file to overlayImage (new upload)
      console.log('🖼️ [OVERLAY FIX] Converting file to overlayImage:', freshQuoteForOverlay.file);
      currentOverlayImage = {
        name: freshQuoteForOverlay.file.name,
        url: freshQuoteForOverlay.file.url,
        fileKey: freshQuoteForOverlay.file.fileKey || '',
        position: { x: 50, y: 50 }, // Centered
        scale: 1, // Full size
        aspectRatio: freshQuoteForOverlay.file.artworkWidth && freshQuoteForOverlay.file.artworkHeight 
          ? freshQuoteForOverlay.file.artworkWidth / freshQuoteForOverlay.file.artworkHeight 
          : 1,
      };
    }
    
    // DIAGNOSTIC: Show overlay from all sources
    
    console.log('🖼️ [OVERLAY FIX] Final overlayImage:', currentOverlayImage);
    
    // Calculate pricing using CORRECT pricing functions (matching upsell path)
    const sqft = (widthIn * heightIn) / 144;
    const basePrice = material === '13oz Vinyl' ? 3.50 : 4.50;
    const unitPrice = sqft * basePrice;
    
    // CORRECT rope pricing: $2 per linear foot (width in feet × 2 × quantity)
    const ropeFeet = quote.addRope ? (widthIn / 12) : 0;
    const ropePrice = ropeFeet > 0 ? (ropeFeet * 2 * quote.quantity) : 0;
    
    // CORRECT pole pocket pricing: $15 setup + $2 per linear foot × quantity
    let polePocketPrice = 0;
    if (quote.polePockets && quote.polePockets !== 'none') {
      const setupFee = 15; // dollars
      const pricePerLinearFoot = 2; // dollars
      let linearFeet = 0;
      switch (quote.polePockets) {
        case 'top':
        case 'bottom':
          linearFeet = widthIn / 12; break;
        case 'left':
        case 'right':
          linearFeet = heightIn / 12; break;
        case 'top-bottom':
          linearFeet = (widthIn / 12) * 2; break;
        default:
          linearFeet = 0;
      }
      polePocketPrice = (setupFee + (linearFeet * pricePerLinearFoot)) * quote.quantity;
    }
    
    const lineTotal = (unitPrice * quote.quantity) + ropePrice + polePocketPrice;
    
    console.log('💰 [UPDATE CART] Pricing calculation:', {
      widthIn,
      heightIn,
      quantity: quote.quantity,
      material,
      addRope: quote.addRope,
      polePockets: quote.polePockets,
      unitPrice,
      ropeFeet,
      ropePrice,
      polePocketPrice,
      lineTotal
    });
    
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
    
    // CRITICAL: Extract text elements from EDITOR objects, not quote store
    // When user deletes text from canvas, editor objects are updated but quote store is not
    const textObjectsFromEditor = freshEditorObjects.filter(obj => obj.type === 'text');
    const textElementsFromEditor = textObjectsFromEditor.map((textObj: any) => ({
      content: textObj.content,
      xPercent: (textObj.x / widthIn) * 100,
      yPercent: (textObj.y / heightIn) * 100,
      fontSize: textObj.fontSize,
      fontFamily: textObj.fontFamily,
      color: textObj.color || textObj.fill,
      fontWeight: textObj.fontWeight,
      fontStyle: textObj.fontStyle,
      textDecoration: textObj.textDecoration,
      textAlign: textObj.textAlign || textObj.align,
      align: textObj.align || textObj.textAlign,
      rotation: textObj.rotation,
    }));
    
    console.log('📝 [TEXT SYNC] Extracted text elements from editor:', textElementsFromEditor);
    console.log('📝 [TEXT SYNC] Old quote.textElements:', freshQuoteForCart.textElements);

    // FINAL_RENDER: Generate high-res snapshot for admin PDF (NON-BLOCKING)
    let finalRenderResult: { url: string; fileKey: string; widthPx: number; heightPx: number; dpi: number } | null = null;
    try {
      const stage = canvasRef.current?.getStage?.();
      if (stage) {
        console.log("[FINAL_RENDER] Generating snapshot...");
        finalRenderResult = await generateFinalRender(stage, widthIn, heightIn);
        if (finalRenderResult) { console.log("[FINAL_RENDER] Success"); }
      }
    } catch (err) { console.error("[FINAL_RENDER] Error:", err); }
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
      textElements: textElementsFromEditor.length > 0 ? textElementsFromEditor : undefined, // CRITICAL: Use editor objects, not quote store
      overlayImage: currentOverlayImage, // BUG 3 FIX: Use extracted overlay image (backward compat)
      overlayImages: currentOverlayImages, // NEW: Save ALL overlay images
      canvasBackgroundColor: canvasBackgroundColor,
      thumbnailUrl: thumbnailUrl, // CRITICAL: Include thumbnail for cart display
      // CRITICAL FIX: Only save file if there are NO text elements and NO overlay images
      // If there ARE text/overlay elements, the thumbnail has them baked in -
      // we DON'T want to load the thumbnail as a background when editing!
      // The thumbnail is only for cart/checkout display, NOT for editor reload.
      file: (textElementsFromEditor.length > 0 || (currentOverlayImages && currentOverlayImages.length > 0))
        ? undefined  // Don't save file - elements are stored separately
        : (thumbnailFileKey ? {
            fileKey: thumbnailFileKey,
            url: thumbnailUrl,
            name: `banner-${Date.now()}.png`
          } : freshQuoteForCart.file),
      // FINAL_RENDER: High-res snapshot for admin PDF
      finalRenderUrl: finalRenderResult?.url,
      finalRenderFileKey: finalRenderResult?.fileKey,
      finalRenderWidthPx: finalRenderResult?.widthPx,
      finalRenderHeightPx: finalRenderResult?.heightPx,
      finalRenderDpi: finalRenderResult?.dpi,
    };
    
    // DIAGNOSTIC: Show what we're about to save
    
    const dummyObj = {
      // CRITICAL: Pass original file (if exists) for background, thumbnailUrl for cart preview
      // If there are text elements OR overlay images, DON'T pass file (thumbnail has text baked in)
      file: (freshQuoteForCart.textElements && freshQuoteForCart.textElements.length > 0) || currentOverlayImages ? undefined : freshQuoteForCart.file,
      thumbnailUrl: thumbnailUrl,
    };
    
    console.log('📦 [ADD TO CART] Quote data:', quoteData);
    console.log('📦 [ADD TO CART] Thumbnail URL type:', typeof thumbnailUrl);
    console.log('📦 [ADD TO CART] Thumbnail URL value:', thumbnailUrl);

    // NOTE: Upsell check moved earlier (before Cloudinary upload) for faster modal display
    // If we reach here, either upsell is disabled or we're editing an existing item

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

  // Handle Buy Now - adds to cart and goes directly to checkout
  const handleBuyNow = () => {
    console.log('🛒 [BannerEditorLayout] Buy Now button clicked');
    
    if (!hasContent) {
      toast({
        title: 'Content Required',
        description: 'Please add some content to your banner before checking out.',
        variant: 'destructive',
      });
      return;
    }

    // Show upsell modal if user should see it
    if (shouldShowUpsell) {
      console.log('🎨 BANNER EDITOR: Showing upsell modal for BUY NOW (checkout)');
      setPendingAction('checkout');
      setShowUpsellModal(true);
      return;
    }

    // No upsell needed - proceed directly to add to cart and checkout
    console.log('🛒 [BUY NOW] No upsell, adding to cart and navigating to checkout');
    
    // Trigger the add to cart flow first
    handleAddToCart();
    
    // Navigate to checkout
    navigate('/checkout');
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

    // CRITICAL FIX: Upload thumbnail to Cloudinary for persistence (SAME AS handleAddToCart)
    // Without this, thumbnails are lost after logout/login
    let upsellThumbnailFileKey: string | undefined = undefined;
    if (thumbnailUrl && (thumbnailUrl.startsWith('data:') || thumbnailUrl.startsWith('blob:'))) {
      console.log('📤 [UPSELL THUMBNAIL UPLOAD] Uploading thumbnail to Cloudinary...');
      try {
        const uploadResult = await uploadCanvasImageToCloudinary(thumbnailUrl, `banner-thumbnail-${Date.now()}.png`);
        thumbnailUrl = uploadResult.secureUrl;
        upsellThumbnailFileKey = uploadResult.fileKey;
        console.log('✅ [UPSELL THUMBNAIL UPLOAD] Uploaded successfully:', { url: thumbnailUrl, fileKey: upsellThumbnailFileKey });
      } catch (uploadError) {
        console.error('❌ [UPSELL THUMBNAIL UPLOAD] Failed:', uploadError);
      }
    } else if (thumbnailUrl && thumbnailUrl.includes('cloudinary.com')) {
      // Extract fileKey from existing Cloudinary URL
      const match = thumbnailUrl.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/);
      if (match) {
        upsellThumbnailFileKey = match[1];
        console.log('✅ [UPSELL THUMBNAIL] Using existing Cloudinary URL, fileKey:', upsellThumbnailFileKey);
      }
    }

    // BUG 3 FIX (UPSELL PATH): Extract overlay image from editor objects
    // CRITICAL: Get FRESH objects from store, not stale editorObjects variable
    const freshEditorObjectsUpsell = useEditorStore.getState().objects;
    console.log('🖼️ [UPSELL BUG 3 FIX] Extracting overlay image from FRESH editor objects...');
    console.log('🖼️ [UPSELL BUG 3 FIX] Fresh editor objects:', freshEditorObjectsUpsell);
    console.log('🖼️ [UPSELL BUG 3 FIX] Current quote.overlayImage:', quote.overlayImage);
    
    // Find image objects in editor (excluding background images)
    const imageObjectsUpsell = freshEditorObjectsUpsell.filter(obj => obj.type === 'image');
    console.log('🖼️ [UPSELL BUG 3 FIX] Found image objects:', imageObjectsUpsell.length);
    
    // Get overlay image from THREE possible sources:
    // 1. Store's overlayImage (for AI backgrounds with logo overlays)
    // 2. Store's file (for regular uploaded images)
    // 3. Editor's image objects (when editing an existing cart item)
    const freshQuoteForOverlayUpsell = useQuoteStore.getState();
    let currentOverlayImageUpsell = freshQuoteForOverlayUpsell.overlayImage;
    
    // CRITICAL FIX: If there are NO image objects in the editor, clear the overlay image
    // This handles the case where user deletes an image from the canvas
    if (imageObjectsUpsell.length === 0) {
      console.log('🗑️ [UPSELL IMAGE DELETE FIX] No image objects in editor - clearing overlayImage');
      currentOverlayImageUpsell = undefined;
    } else if (imageObjectsUpsell.length > 0) {
      // Extract from editor (editing mode or new image added)
      const overlayObj = imageObjectsUpsell[0]; // Use first image object
      console.log('🖼️ [UPSELL OVERLAY FIX] Extracting from editor object:', overlayObj);
      
      const xPercent = (overlayObj.x / widthIn) * 100;
      const yPercent = (overlayObj.y / heightIn) * 100;
      const aspectRatio = overlayObj.width && overlayObj.height ? overlayObj.width / overlayObj.height : 1;
      const defaultWidthInches = 4;
      const scale = overlayObj.width ? overlayObj.width / defaultWidthInches : 1;
      
      currentOverlayImageUpsell = {
        name: overlayObj.name || 'overlay-image',
        url: overlayObj.url || '',
        fileKey: overlayObj.cloudinaryPublicId || overlayObj.fileKey || '',
        position: { x: xPercent, y: yPercent },
        scale: scale,
        aspectRatio: aspectRatio,
      };
    } else if (!currentOverlayImageUpsell && freshQuoteForOverlayUpsell.file) {
      // Convert file to overlayImage (new upload)
      console.log('🖼️ [UPSELL OVERLAY FIX] Converting file to overlayImage:', freshQuoteForOverlayUpsell.file);
      currentOverlayImageUpsell = {
        name: freshQuoteForOverlayUpsell.file.name,
        url: freshQuoteForOverlayUpsell.file.url,
        fileKey: freshQuoteForOverlayUpsell.file.fileKey || '',
        position: { x: 50, y: 50 }, // Centered
        scale: 1, // Full size
        aspectRatio: freshQuoteForOverlayUpsell.file.artworkWidth && freshQuoteForOverlayUpsell.file.artworkHeight 
          ? freshQuoteForOverlayUpsell.file.artworkWidth / freshQuoteForOverlayUpsell.file.artworkHeight 
          : 1,
      };
    }
    
    console.log('🖼️ [UPSELL OVERLAY FIX] Final overlayImage:', currentOverlayImageUpsell);

    // Build updated quote object with selected options
    // CRITICAL: Convert editor text objects to textElements format for cart storage
    // Use freshEditorObjectsUpsell (already extracted above) not stale editorObjects
    const textElementsFromEditorUpsell = freshEditorObjectsUpsell
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
      textElements: textElementsFromEditorUpsell.length > 0 ? textElementsFromEditorUpsell : undefined,
      overlayImage: currentOverlayImageUpsell,
      canvasBackgroundColor: canvasBackgroundColor,
      // CRITICAL FIX: Include file with fileKey for thumbnail persistence
      file: upsellThumbnailFileKey ? { 
        fileKey: upsellThumbnailFileKey,
        url: thumbnailUrl,
        name: `banner-${Date.now()}.png`
      } : undefined,
      thumbnailUrl: thumbnailUrl,
    };

    // Apply selected upsell options
    selectedOptions.forEach(option => {
      if (!option.selected) return; // Skip unselected options
      
      if (option.id === 'grommets' && option.grommetSelection) {
        updatedQuote.grommets = option.grommetSelection as any;
      } else if (option.id === 'rope') {
        updatedQuote.addRope = true;
      } else if (option.id === 'polePockets' && option.polePocketSelection) {
        updatedQuote.polePockets = option.polePocketSelection;
        updatedQuote.polePocketSize = option.polePocketSize || '2';
      }
    });

    // Calculate pricing with upsells using CORRECT pricing functions
    const sqft = (widthIn * heightIn) / 144;
    const basePrice = material === '13oz Vinyl' ? 3.50 : 4.50;
    const unitPrice = sqft * basePrice;
    
    // CORRECT rope pricing: $2 per linear foot (width in feet × 2 × quantity)
    const ropeFeet = updatedQuote.addRope ? (widthIn / 12) : 0;
    const ropePrice = ropeFeet > 0 ? (ropeFeet * 2 * quote.quantity) : 0;
    
    // CORRECT pole pocket pricing: $15 setup + $2 per linear foot × quantity
    let polePocketPrice = 0;
    if (updatedQuote.polePockets && updatedQuote.polePockets !== 'none') {
      const setupFee = 15; // dollars
      const pricePerLinearFoot = 2; // dollars
      let linearFeet = 0;
      switch (updatedQuote.polePockets) {
        case 'top':
        case 'bottom':
          linearFeet = widthIn / 12; break;
        case 'left':
        case 'right':
          linearFeet = heightIn / 12; break;
        case 'top-bottom':
          linearFeet = (widthIn / 12) * 2; break;
        default:
          linearFeet = 0;
      }
      polePocketPrice = (setupFee + (linearFeet * pricePerLinearFoot)) * quote.quantity;
    }
    
    const lineTotal = (unitPrice * quote.quantity) + ropePrice + polePocketPrice;
    
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
      
      // Different toast message based on action
      if (pendingAction === 'checkout') {
        toast({
          title: "Proceeding to Checkout",
          description: "Your banner has been added. Redirecting to checkout...",
        });
      } else {
        toast({
          title: "Added to Cart",
          description: "Your banner has been added to the cart.",
        });
      }
    }
    
    // Clear uploaded images
    window.dispatchEvent(new Event('clearUploadedImages'));
    
    // Close modal
    setShowUpsellModal(false);
    
    // Reset design
    console.log('🔄 RESET: About to call resetDesign() after upsell');
    resetDesign();
    console.log('🔄 RESET: resetDesign() called');
    
    // Navigate based on pending action
    if (pendingAction === 'checkout') {
      console.log('🛒 [UPSELL] Navigating to checkout after upsell');
      navigate('/checkout');
    } else {
      // Scroll to top so user can see the cart
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    
    setPendingAction(null);
  };

  const handleUpsellClose = () => {
    setShowUpsellModal(false);
    setPendingAction(null);
  };

  const togglePanel = (panelId: PanelType) => {
    setActivePanel(activePanel === panelId ? null : panelId);
  };

  // Define sidebar button configuration (without components to avoid stale closures)
  // Order: Uploads, Size, Material, Options, Text, Text Color, Canvas Background, Inspector
  const sidebarButtons = [
    {
      id: 'uploads' as PanelType,
      icon: <Upload className="w-6 h-6" />,
      label: 'Uploads',
    },
    {
      id: 'size' as PanelType,
      icon: <Maximize2 className="w-6 h-6" />,
      label: 'Size',
    },
    {
      id: 'material' as PanelType,
      icon: <Settings className="w-6 h-6" />,
      label: 'Material',
    },
    {
      id: 'options' as PanelType,
      icon: <Wrench className="w-6 h-6" />,
      label: 'Options',
    },
    {
      id: 'text' as PanelType,
      icon: <Type className="w-6 h-6" />,
      label: 'Text',
    },
    {
      id: 'colors' as PanelType,
      icon: <Palette className="w-6 h-6" />,
      label: 'Text Color',
    },
    {
      id: 'canvas' as PanelType,
      icon: <Sliders className="w-6 h-6" />,
      label: 'Canvas Background',
    },
    {
      id: 'inspector' as PanelType,
      icon: <Eye className="w-6 h-6" />,
      label: 'Inspector',
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
    {/* Debug button for testing */}
    {window.location.search.includes('debug=1') && (
      <div className="fixed top-20 right-4 z-[9999] bg-red-500 text-white p-4 rounded shadow-lg">
        <p className="font-bold">DEBUG MODE</p>
        <p className="text-sm">editingItemId: {editingItemId || 'null'}</p>
        <p className="text-sm">file: {file ? 'yes' : 'no'}</p>
        <p className="text-sm">overlayImage: {overlayImage ? 'yes' : 'no'}</p>
        <p className="text-sm">textElements: {textElements?.length || 0}</p>
        <p className="text-sm">editorObjects: {editorObjects?.length || 0}</p>
      </div>
    )}
    <div className="flex flex-col h-[calc(100dvh-145px)] lg:h-screen bg-gradient-to-br from-gray-50 to-gray-100">


      {/* Professional Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm z-20">
        <div className="px-2 sm:px-4 py-1.5 sm:py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Palette className="w-5 h-5 sm:w-6 sm:h-6 text-[#18448D] hidden xs:block" />
            <div>
              <h1 className="text-base sm:text-lg font-bold text-gray-900">Banner Designer</h1>
              <p className="text-xs text-gray-500 hidden sm:block">Professional design tool</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            
            {/* Canva Design Button - Admin only for testing */}
            {isAdminUser && (
              <Button
                onClick={handleDesignInCanva}
                variant="outline"
                size="sm"
                className="hidden sm:flex items-center gap-2 relative bg-gradient-to-r from-[#8B3DFF] to-[#00C4CC] hover:from-[#7D2AE7] hover:to-[#00B8C4] text-white border-0"
              >
                <Palette className="w-4 h-4" />
                Canva
                <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[10px] font-bold px-1 py-0.5 rounded-full">ADMIN</span>
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
              className="min-h-[44px] min-w-[44px] bg-[#18448D] hover:bg-[#0f2d5c] text-white"
            >
              <Eye className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Preview</span>
            </Button>
            <Button
              onClick={handleAddToCart}
              disabled={!hasContent}
              size="sm"
              className="min-h-[44px] bg-[#18448D] hover:bg-[#0f2d5c] text-white px-2 sm:px-3"
            >
              <ShoppingCart className="w-4 h-4 mr-1 sm:mr-2 flex-shrink-0" />
              <span className="text-xs sm:text-sm whitespace-nowrap">{editingItemId ? 'Update' : 'Add to Cart'}</span>
            </Button>
            {/* Buy Now button - only show when not editing */}
            {!editingItemId && (
              <Button
                onClick={handleBuyNow}
                disabled={!hasContent}
                size="sm"
                className="min-h-[44px] bg-[#ff6b35] hover:bg-[#f7931e] text-white font-semibold px-2 sm:px-3"
              >
                <CreditCard className="w-4 h-4 mr-1 sm:mr-2 flex-shrink-0" />
                <span className="text-xs sm:text-sm whitespace-nowrap">Buy Now</span>
              </Button>
            )}
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
                className={`flex flex-col items-center justify-center py-4 px-2 min-h-[60px] min-w-[60px] transition-all duration-200 relative group ${
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
            className="hidden lg:block absolute left-20 top-0 bottom-0 w-96 bg-white border-r border-gray-200 shadow-xl z-30 pointer-events-auto"
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
              
              {/* Panel Content - overflow-y-auto to allow scrolling for long content like Inspector */}
              <div className="flex-1 p-4 overflow-y-auto">
                {activePanel && renderPanelContent(activePanel)}
              </div>
            </div>
          </div>
        )}

        {/* Canvas Area - Full Width (Both Mobile & Desktop) */}
        {/* CRITICAL: Single canvas instance ensures canvasRef always points to visible canvas */}
        <div className="flex flex-1 flex-col bg-gray-100 overflow-hidden relative z-0">
          {/* Canvas Toolbar - Grid Toggle */}
          <div className="flex items-center justify-end px-2 py-1 lg:px-4 lg:py-2 bg-white border-b border-gray-200">
            <button
              onClick={() => setShowGrid(!showGrid)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                showGrid 
                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Grid3X3 className="w-4 h-4" />
              <span className="hidden sm:inline">Show Grid</span>
            </button>
          </div>
          {/* Mobile: smaller padding, space for bottom toolbar; Desktop: normal padding */}
          <div className="flex-1 p-1 sm:p-2 lg:p-4 overflow-auto pb-16 lg:pb-4">
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
                className={`flex-shrink-0 flex flex-col items-center justify-center py-3 px-4 min-w-[80px] min-h-[56px] transition-all duration-200 ${
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
              
              {/* Panel Content - overflow-y-auto to allow scrolling for long content like Inspector */}
              <div className="flex-1 p-4 overflow-y-auto">
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
            <div className="bg-gray-100 p-4 rounded-lg flex items-center justify-center">
              {canvasThumbnail ? (
                <div className="relative inline-block">
                  <img 
                    src={canvasThumbnail} 
                    alt="Banner Preview" 
                    className="max-w-full max-h-[60vh] object-contain rounded shadow-lg" 
                  />
                  {/* Grommets SVG Overlay */}
                  {grommets !== 'none' && grommetPositions.length > 0 && (
                    <svg
                      viewBox={`0 0 ${widthIn} ${heightIn}`}
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      preserveAspectRatio="xMidYMid meet"
                    >
                      <defs>
                        <radialGradient id="layoutPreviewGrommetGradient" cx="30%" cy="30%">
                          <stop offset="0%" stopColor="#e2e8f0" />
                          <stop offset="50%" stopColor="#a0aec0" />
                          <stop offset="100%" stopColor="#4a5568" />
                        </radialGradient>
                      </defs>
                      {grommetPositions.map((point, index) => (
                        <g key={index}>
                          {/* Drop shadow */}
                          <circle
                            cx={point.x + 0.05}
                            cy={point.y + 0.05}
                            r={grommetR * 1.2}
                            fill="#000000"
                            opacity="0.2"
                          />
                          {/* Outer metallic ring */}
                          <circle
                            cx={point.x}
                            cy={point.y}
                            r={grommetR * 1.2}
                            fill="url(#layoutPreviewGrommetGradient)"
                            stroke="#2d3748"
                            strokeWidth={grommetR * 0.1}
                          />
                          {/* Inner hole */}
                          <circle
                            cx={point.x}
                            cy={point.y}
                            r={grommetR * 0.6}
                            fill="#f7fafc"
                            stroke="#cbd5e0"
                            strokeWidth={grommetR * 0.05}
                          />
                          {/* Highlight for 3D effect */}
                          <circle
                            cx={point.x - grommetR * 0.3}
                            cy={point.y - grommetR * 0.3}
                            r={grommetR * 0.25}
                            fill="#ffffff"
                            opacity="0.5"
                          />
                        </g>
                      ))}
                    </svg>
                  )}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-8">
                  No preview available
                </div>
              )}
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
                  <span className="font-medium">{grommets === 'none' ? 'None' : grommets}</span>
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
