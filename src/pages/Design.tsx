import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';
import { Palette } from 'lucide-react';
import BannerEditorLayout from '@/components/design/BannerEditorLayout';
import NewAIGenerationModal from '@/components/design/NewAIGenerationModal';
import { useQuoteStore, MaterialKey } from '@/store/quote';
import { useToast } from '@/components/ui/use-toast';

const Design: React.FC = () => {
  const [aiModalOpen, setAiModalOpen] = useState(false);
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
      
      <BannerEditorLayout onOpenAIModal={() => setAiModalOpen(true)} />
      
      <NewAIGenerationModal 
        open={aiModalOpen} 
        onOpenChange={setAiModalOpen} 
      />
    </Layout>
  );
};

export default Design;
