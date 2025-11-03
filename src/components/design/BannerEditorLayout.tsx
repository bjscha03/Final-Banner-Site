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
  Save, 
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
import PricingCard from './PricingCard';


interface BannerEditorLayoutProps {
  onOpenAIModal?: () => void;
}

type PanelType = 'uploads' | 'text' | 'material' | 'size' | 'options' | 'pricing' | 'inspector' | 'colors' | 'canvas' | null;

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
  const { exportToJSON, setCanvasThumbnail, canvasThumbnail, objects: editorObjects, addObject, reset: resetEditor, canvasBackgroundColor, showGrommets } = useEditorStore();
  const quote = useQuoteStore();
  const { set: setQuote, editingItemId, overlayImage, textElements, file, grommets, widthIn, heightIn, material, resetDesign } = quote;

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

  const { addFromQuote } = useCartStore();
  
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

      // Get current visibility state
      const { showBleed, showSafeZone, showGrid, setShowBleed, setShowSafeZone, setShowGrid } = useEditorStore.getState();
      const wasShowingBleed = showBleed;
      const wasShowingSafeZone = showSafeZone;
      const wasShowingGrid = showGrid;
      
      // Hide borders and grid for clean thumbnail
      setShowBleed(false);
      setShowSafeZone(false);
      setShowGrid(false);
      
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

    console.log('[BannerEditorLayout] Loading cart item objects for editing:', { editingItemId, overlayImage, textElements });

    // Load overlay image if present
    if (overlayImage && overlayImage.url) {
      console.log('[BannerEditorLayout] Adding overlayImage to canvas:', overlayImage);
      addObject({
        type: 'image',
        url: overlayImage.url,
        x: overlayImage.position?.x || 0,
        y: overlayImage.position?.y || 0,
        width: overlayImage.width || 200,
        height: overlayImage.height || 200,
        rotation: overlayImage.rotation || 0,
        scaleX: overlayImage.scaleX || 1,
        scaleY: overlayImage.scaleY || 1,
        visible: true,
      });
    }

    // Load text elements if present
    if (textElements && textElements.length > 0) {
      console.log('[BannerEditorLayout] Adding text elements to canvas:', textElements);
      textElements.forEach((textEl: any) => {
        addObject({
          type: 'text',
          text: textEl.text,
          x: textEl.x || 0,
          y: textEl.y || 0,
          fontSize: textEl.fontSize || 24,
          fontFamily: textEl.fontFamily || 'Arial',
          fill: textEl.color || '#000000',
          fontStyle: textEl.fontStyle || 'normal',
          textDecoration: textEl.textDecoration || '',
          align: textEl.align || 'left',
          rotation: textEl.rotation || 0,
          visible: true,
        });
      });
    }

    console.log('[BannerEditorLayout] Finished loading cart item objects');
  }, [editingItemId]); // Only run when editingItemId changes

  const handleSave = () => {
    try {
      const designJSON = exportToJSON();
      setQuote({
        canvasDesign: designJSON,
        hasCanvasDesign: true,
      });

      toast({
        title: 'Design Saved',
        description: 'Your banner design has been saved successfully.',
      });
    } catch (error) {
      toast({
        title: 'Save Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

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

  const handleAddToCart = () => {
    console.log(`🎯 [BannerEditorLayout] ${editingItemId ? 'Update' : 'Add to'} Cart button clicked`);
    
    if (!hasContent) {
      toast({
        title: 'Content Required',
        description: 'Please add some content to your banner before adding to cart.',
        variant: 'destructive',
      });
      return;
    }

    // Generate thumbnail for cart preview
    // Use the canvas thumbnail from the editor store (auto-generated) - SAME AS PricingCard
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
      // Don't pass file object - use thumbnailUrl instead
      file: undefined,
      thumbnailUrl: thumbnailUrl,
    };
    
    console.log('�� [ADD TO CART] Quote data:', quoteData);
    console.log('📦 [ADD TO CART] Thumbnail URL type:', typeof thumbnailUrl);
    console.log('📦 [ADD TO CART] Thumbnail URL value:', thumbnailUrl);
    
    // Show upsell modal if user should see it
    if (shouldShowUpsell) {
      console.log('🎨 BANNER EDITOR: Showing upsell modal for ADD TO CART');
      console.log('🎨 BANNER EDITOR: canvasThumbnail:', canvasThumbnail ? canvasThumbnail.substring(0, 50) + '...' : 'NULL');
      setPendingAction('cart');
      setShowUpsellModal(true);
      return;
    }

    // Proceed directly to add to cart
    addFromQuote(quoteData as any, undefined, pricing);
    
    // Clear uploaded images from AssetsPanel after successful add to cart
    window.dispatchEvent(new Event('clearUploadedImages'));
    
    toast({
      title: "Added to Cart",
      description: "Your banner has been added to the cart.",
    });
      
    // Scroll to top so user can see the cart
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Reset design area after successful add
    console.log('🔄 RESET: About to call resetDesign() after add to cart');
    resetDesign();
    console.log('🔄 RESET: resetDesign() called');
  };

  const handleUpsellContinue = (selectedOptions: UpsellOption[], dontAskAgain: boolean) => {
    console.log("[BannerEditorLayout] handleUpsellContinue called with:", { selectedOptions, dontAskAgain, pendingAction });

    // Save "don't ask again" preference
    if (dontAskAgain) {
      localStorage.setItem('upsell-dont-show-again', 'true');
      setDontShowUpsellAgain(true);
    }

    // Generate thumbnail for cart preview
    let thumbnailUrl = canvasThumbnail;
    
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
      textElements: quote.textElements,
      overlayImage: quote.overlayImage,
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

    // Add to cart
    addFromQuote(updatedQuote as any, undefined, pricing);
    
    // Clear uploaded images
    window.dispatchEvent(new Event('clearUploadedImages'));
    
    toast({
      title: "Added to Cart",
      description: "Your banner has been added to the cart.",
    });
    
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
      id: 'pricing' as PanelType,
      icon: <ShoppingCart className="w-6 h-6" />,
      label: 'Pricing/Cart',
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
      case 'pricing':
        return <PricingCard />;
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
              onClick={handleSave}
              variant="outline"
              size="sm"
              className="hidden sm:flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Save
            </Button>
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
