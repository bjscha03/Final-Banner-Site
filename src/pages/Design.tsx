import React, { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';
import { Palette, Info, Upload } from 'lucide-react';
import BannerEditorLayout from '@/components/design/BannerEditorLayout';
import PrintReadyUploadPanel from '@/components/design/PrintReadyUploadPanel';
import NewAIGenerationModal from '@/components/design/NewAIGenerationModal';
import { useQuoteStore, MaterialKey } from '@/store/quote';
import { useToast } from '@/components/ui/use-toast';

/*
 * MANUAL QA CHECKLIST:
 * ✓ Mobile: Uploads, size, material, options, text tools still work
 * ✓ Mobile: Add to Cart, Buy Now, Preview still work
 * ✓ Desktop: layout unchanged; no spacing regressions
 * ✓ No console errors
 */

const Design: React.FC = () => {
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [printReadyPanelOpen, setPrintReadyPanelOpen] = useState(false);
  const [designServiceMode, setDesignServiceMode] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { set: setFromQuickQuote } = useQuoteStore();

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


      {/* Print-ready file button - visible on mobile */}
      <div className="lg:hidden mx-2 my-3">
        <a
          href="https://bannersonthefly.com/google-ads-banner"
          className="flex items-center justify-center w-full min-h-[48px] border-2 border-gray-300 hover:border-gray-400 text-gray-700 font-medium text-base rounded-md bg-white"
        >
          <Upload className="w-5 h-5 mr-2" />
          I already have a print-ready file
        </a>
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
      
      <PrintReadyUploadPanel 
        open={printReadyPanelOpen} 
        onClose={() => setPrintReadyPanelOpen(false)} 
      />
    </Layout>
  );
};

export default Design;
