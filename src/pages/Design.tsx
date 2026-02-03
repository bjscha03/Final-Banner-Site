import React, { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';
import { Palette, Info, Sparkles, Upload } from 'lucide-react';
import BannerEditorLayout from '@/components/design/BannerEditorLayout';
import NewAIGenerationModal from '@/components/design/NewAIGenerationModal';
import { useQuoteStore, MaterialKey } from '@/store/quote';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';

/*
 * MANUAL QA CHECKLIST:
 * ✓ Mobile: new Free Design CTA appears above editor/canvas
 * ✓ Mobile: "Start My Free Design" triggers the same Let Us Design flow as existing button
 * ✓ Mobile: "I already have a print-ready file" scrolls to editor/upload area
 * ✓ Mobile: Uploads, size, material, options, text tools still work
 * ✓ Mobile: Add to Cart, Buy Now, Preview still work
 * ✓ Desktop: layout unchanged; no spacing regressions
 * ✓ No console errors
 */

const Design: React.FC = () => {
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [designServiceMode, setDesignServiceMode] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { set: setFromQuickQuote } = useQuoteStore();

  // Shared handler for "Let Us Design It" flow
  const handleLetUsDesign = () => {
    setDesignServiceMode(true);
    // Scroll to editor area on mobile after a short delay
    setTimeout(() => {
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  // Handler for "I already have a print-ready file" - scrolls to editor/upload area
  const handleScrollToEditor = () => {
    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Optional: briefly highlight the Uploads button area
    const uploadsButton = document.querySelector('[data-sidebar-button]');
    if (uploadsButton) {
      uploadsButton.classList.add('ring-2', 'ring-orange-400', 'ring-offset-2');
      setTimeout(() => {
        uploadsButton.classList.remove('ring-2', 'ring-orange-400', 'ring-offset-2');
      }, 1500);
    }
  };

  // Handle AI modal parameter
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.has('ai') && import.meta.env.VITE_AI_BANNER_ENABLED !== 'false') {
      console.log('🎨 AI parameter detected, opening AI modal');
      setAiModalOpen(true);
      
      // Remove the 'ai' parameter from URL
      searchParams.delete('ai');
      const newUrl = searchParams.toString() ? `${location.pathname}?${searchParams.toString()}` : location.pathname;
      navigate(newUrl, { replace: true });
    }
  }, [location.search, navigate]);

  // Handle quick quote parameters
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const width = searchParams.get('width');
    const height = searchParams.get('height');
    const qty = searchParams.get('qty');
    const material = searchParams.get('material');

    console.log('🟢 DESIGN PAGE: URL params:', { width, height, qty, material });
    
    if (width && height && qty && material) {
      console.log('🟢 DESIGN PAGE: All params present, applying...');
      const widthIn = parseFloat(width);
      const heightIn = parseFloat(height);
      const quantity = parseInt(qty);

      if (widthIn >= 1 && widthIn <= 1000 &&
          heightIn >= 1 && heightIn <= 1000 &&
          quantity >= 1 &&
          ['13oz', '15oz', '18oz', 'mesh'].includes(material)) {

        // Apply the quick quote data to the store
        console.log('🟢 DESIGN PAGE: Calling setFromQuickQuote with:', { widthIn, heightIn, quantity, material });
        setFromQuickQuote({
          widthIn,
          heightIn,
          quantity,
          material: material as MaterialKey
        });
        console.log('🟢 DESIGN PAGE: setFromQuickQuote called successfully');

        const materialName = {
          '13oz': '13oz Vinyl',
          '15oz': '15oz Vinyl',
          '18oz': '18oz Vinyl',
          'mesh': 'Mesh Vinyl'
        }[material];

        toast({
          title: "Quick Quote Applied",
          description: `${widthIn}" × ${heightIn}" ${materialName} banner (Qty: ${quantity})`,
        });

        // Clear URL parameters after applying
        navigate(location.pathname, { replace: true });
      } else {
        console.error('🔴 DESIGN PAGE: Invalid parameter values');
      }
    }
  }, [location.search, location.pathname, navigate, setFromQuickQuote, toast]);

  return (
    <Layout>
      {/* Hide PageHeader on mobile to maximize canvas visibility - saves ~200-300px */}
      <div className="hidden lg:block">
        <PageHeader
          title="Design Your Banner"
          subtitle="Create custom banners with our advanced design tools"
          icon={Palette}
        />
      </div>

      {/* Preview Disclaimer - updated copy (all devices) */}
      <div className="mx-2 lg:mx-8 my-1 lg:my-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-2 py-1.5 lg:px-4 lg:py-3 flex items-start gap-2 lg:gap-3">
          <Info className="h-4 w-4 lg:h-5 lg:w-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs lg:text-sm text-blue-800">
            Every order is reviewed by a real designer before printing. If anything looks off, we'll contact you.
          </p>
        </div>
      </div>

      {/* Mobile-only Free Design CTA Section - appears ABOVE editor/canvas */}
      <div className="lg:hidden mx-2 my-3">
        <div className="bg-white border-2 border-gray-200 rounded-xl p-4 shadow-sm">
          {/* Eyebrow */}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Don't want to design this yourself?
          </p>
          
          {/* Headline */}
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            We'll design your banner FREE.
          </h2>
          
          {/* Body */}
          <p className="text-sm text-gray-700 mb-3">
            Tell us what you need and our designers will create it for you. We'll send proofs until you love it — no extra cost.
          </p>
          
          {/* Trust line */}
          <p className="text-xs text-gray-500 mb-4 flex items-center gap-1 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-1 h-1 bg-green-500 rounded-full"></span>
              Printed in 24 hours
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-1 h-1 bg-green-500 rounded-full"></span>
              Free Next-Day Air Shipping
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-1 h-1 bg-green-500 rounded-full"></span>
              Human reviewed before printing
            </span>
          </p>
          
          {/* Primary CTA */}
          <Button
            onClick={handleLetUsDesign}
            className="w-full mb-2 min-h-[48px] bg-gradient-to-r from-[#18448D] to-indigo-600 hover:from-[#0f2d5c] hover:to-indigo-700 text-white font-semibold text-base"
          >
            <Sparkles className="w-5 h-5 mr-2" />
            Start My Free Design
          </Button>
          
          {/* Secondary CTA */}
          <Button
            onClick={handleScrollToEditor}
            variant="outline"
            className="w-full min-h-[48px] border-2 border-gray-300 hover:border-gray-400 text-gray-700 font-medium text-base"
          >
            <Upload className="w-5 h-5 mr-2" />
            I already have a print-ready file
          </Button>
        </div>
      </div>
      
      {/* Editor/Canvas Area - ref for scroll target */}
      <div ref={editorRef}>
        <BannerEditorLayout 
          onOpenAIModal={() => setAiModalOpen(true)}
          designServiceMode={designServiceMode}
          onDesignServiceModeChange={setDesignServiceMode}
        />
      </div>
      
      <NewAIGenerationModal 
        open={aiModalOpen} 
        onOpenChange={setAiModalOpen} 
      />
    </Layout>
  );
};

export default Design;
