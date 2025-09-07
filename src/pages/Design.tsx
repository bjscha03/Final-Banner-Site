import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import Layout from '@/components/Layout';
import SizeQuantityCard from '@/components/design/SizeQuantityCard';
import MaterialCard from '@/components/design/MaterialCard';
import OptionsCard from '@/components/design/OptionsCard';
import LivePreviewCard from '@/components/design/LivePreviewCard';
import PricingCard from '@/components/design/PricingCard';
import { useQuoteStore, MaterialKey } from '@/store/quote';
import { useToast } from '@/components/ui/use-toast';

const Design: React.FC = () => {
  const location = useLocation();
  const { setFromQuickQuote } = useQuoteStore();
  const { toast } = useToast();
  const hasAppliedQuickQuote = useRef(false);
  const configuratorRef = useRef<HTMLDivElement>(null);

  // Ensure page starts at top on navigation
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    // Only apply quick quote once per page load
    if (hasAppliedQuickQuote.current) return;

    const searchParams = new URLSearchParams(location.search);
    const width = searchParams.get('width');
    const height = searchParams.get('height');
    const qty = searchParams.get('qty');
    const material = searchParams.get('material');

    // Check URL parameters first
    if (width && height && qty && material) {
      const widthIn = parseFloat(width);
      const heightIn = parseFloat(height);
      const quantity = parseInt(qty);

      if (widthIn >= 1 && widthIn <= 1000 &&
          heightIn >= 1 && heightIn <= 1000 &&
          quantity >= 1 &&
          ['13oz', '15oz', '18oz', 'mesh'].includes(material)) {

        // Apply the quick quote data to the store
        setFromQuickQuote({
          widthIn,
          heightIn,
          quantity,
          material: material as MaterialKey
        });

        const materialName = {
          '13oz': '13oz Vinyl',
          '15oz': '15oz Vinyl',
          '18oz': '18oz Vinyl',
          'mesh': 'Mesh Vinyl'
        }[material];

        toast({
          title: "Quick Quote Applied",
          description: `Your Quick Quote was applied: ${widthIn}" × ${heightIn}", ${materialName}, qty ${quantity}.`,
        });

        // Ensure page starts at the top
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 100);

        hasAppliedQuickQuote.current = true;

        // Clear URL parameters after applying
        const newUrl = new URL(window.location.href);
        newUrl.search = '';
        window.history.replaceState({}, '', newUrl.toString());

        return;
      }
    }

    // Fallback to sessionStorage
    try {
      const quickQuoteData = sessionStorage.getItem('quickQuote');
      if (quickQuoteData) {
        const parsed = JSON.parse(quickQuoteData);

        if (parsed.widthIn && parsed.heightIn && parsed.quantity && parsed.material) {
          setFromQuickQuote(parsed);

          const materialName = {
            '13oz': '13oz Vinyl',
            '15oz': '15oz Vinyl',
            '18oz': '18oz Vinyl',
            'mesh': 'Mesh Vinyl'
          }[parsed.material];

          toast({
            title: "Quick Quote Applied",
            description: `Your Quick Quote was applied: ${parsed.widthIn}" × ${parsed.heightIn}", ${materialName}, qty ${parsed.quantity}.`,
          });

          // Ensure page starts at the top
          setTimeout(() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }, 100);

          hasAppliedQuickQuote.current = true;

          // Clear sessionStorage
          sessionStorage.removeItem('quickQuote');
        }
      }
    } catch (error) {
      console.error('Error parsing quick quote data:', error);
    }
  }, [location.search, setFromQuickQuote, toast]);

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 pt-8 pb-4 sm:pt-12 sm:pb-6 md:pt-16 md:pb-8 relative" style={{ touchAction: 'pan-y' }}>
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-blue-300/20 to-transparent rounded-full blur-3xl transform -translate-x-1/2 -translate-y-1/2"></div>
          <div className="absolute top-1/3 right-0 w-80 h-80 bg-gradient-to-bl from-indigo-300/20 to-transparent rounded-full blur-3xl transform translate-x-1/2"></div>
          <div className="absolute bottom-0 left-1/3 w-72 h-72 bg-gradient-to-tr from-purple-300/20 to-transparent rounded-full blur-3xl transform translate-y-1/2"></div>
        </div>

        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-6 md:mb-8">
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold bg-gradient-to-r from-gray-900 via-blue-800 to-indigo-800 bg-clip-text text-transparent mb-3 md:mb-4 px-4">
              Design Your Custom Banner
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-gray-700 max-w-2xl mx-auto px-4">
              Create professional banners with our easy-to-use design tool.
              See live previews and get instant pricing as you customize.
            </p>
          </div>

          <div ref={configuratorRef}>
            {/* Mobile Layout: Vertical stack with optimal order */}
            <div className="block lg:hidden space-y-4 md:space-y-6">
              <SizeQuantityCard />
              <LivePreviewCard />
              <MaterialCard />
              <OptionsCard />
              <PricingCard />
            </div>

            {/* Desktop Layout: Two columns */}
            <div className="hidden lg:grid lg:grid-cols-2 lg:gap-6">
              {/* Left Column - Configuration */}
              <div className="space-y-6">
                <SizeQuantityCard />
                <MaterialCard />
                <OptionsCard />
              </div>

              {/* Right Column - Preview & Pricing */}
              <div className="space-y-6">
                <LivePreviewCard />
                <div className="sticky top-6">
                  <PricingCard />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Design;