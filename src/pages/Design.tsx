import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import SizeQuantityCard from '@/components/design/SizeQuantityCard';
import MaterialCard from '@/components/design/MaterialCard';
import OptionsCard from '@/components/design/OptionsCard';
import LivePreviewCard from '@/components/design/LivePreviewCard';
import PricingCard from '@/components/design/PricingCard';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useQuoteStore, MaterialKey } from '@/store/quote';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/auth';
import NewAIGenerationModal from '@/components/design/NewAIGenerationModal';

const Design: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [aiModalOpen, setAiModalOpen] = useState(false);

  // Handle AI modal opening with authentication check
  const handleOpenAIModal = () => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in or create an account to use AI banner generation.',
        variant: 'default',
      });
      navigate('/sign-in?next=/design?ai=true');
      return;
    }
    setAiModalOpen(true);
  };
  
  // Check for AI auto-open parameter
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.has('ai') && import.meta.env.VITE_AI_BANNER_ENABLED !== 'false') {
      setAiModalOpen(true);
      // Remove ai parameter from URL
      searchParams.delete('ai');
      const newUrl = searchParams.toString() ? `${location.pathname}?${searchParams.toString()}` : location.pathname;
      navigate(newUrl, { replace: true });
    }
  }, [location, navigate]);
  const { setFromQuickQuote } = useQuoteStore();
  const hasAppliedQuickQuote = useRef(false);
  const configuratorRef = useRef<HTMLDivElement>(null);

  // Ensure page starts at top on navigation
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Check for pending AI image from "Use in Design" button
  useEffect(() => {
    try {
      const pendingImage = localStorage.getItem('pending_ai_image');
      if (pendingImage) {
        console.log('[Design] Loading pending AI image:', pendingImage);
        
        // Small delay to ensure store is ready
        setTimeout(() => {
          try {
            // Load the AI image into the design canvas as the background image
            const { set } = useQuoteStore.getState();
            set({
              file: {
                url: pendingImage,
                name: 'AI Generated Banner',
                isPdf: false,
                fileKey: `ai-image-${Date.now()}`,
                type: 'image/jpeg',
                size: 0
              }
            });
            
            // Clear the pending image from localStorage
            localStorage.removeItem('pending_ai_image');
            
            // Show success toast
            if (toast) {
              toast({
                title: 'AI Image Loaded',
                description: 'Your saved AI image has been loaded into the design canvas.',
              });
            }
            
            console.log('[Design] Pending AI image loaded successfully');
          } catch (error) {
            console.error('[Design] Error loading pending AI image:', error);
            localStorage.removeItem('pending_ai_image');
          }
        }, 100);
      }
    } catch (error) {
      console.error('[Design] Error in pending AI image effect:', error);
    }
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
      <div className="min-h-screen bg-white pt-8 pb-4 sm:pt-12 sm:pb-6 md:pt-16 md:pb-8 relative" style={{ touchAction: 'pan-y pinch-zoom' }}>

        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-8 md:mb-12">
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 md:mb-6 px-6 sm:px-8 md:px-12 lg:px-16 leading-tight">
              Design Your Custom Banner
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-gray-700 max-w-2xl mx-auto px-4">
              Create professional banners with our easy-to-use design tool.
              See live previews and get instant pricing as you customize.
            </p>
          </div>

          <div ref={configuratorRef}>
            {/* Mobile Layout: Vertical stack with optimal order */}
            <div className="block lg:hidden space-y-6 md:space-y-8">
              <SizeQuantityCard />
              <LivePreviewCard onOpenAIModal={handleOpenAIModal} />
              <MaterialCard />
              <OptionsCard />
              <ErrorBoundary>
                <PricingCard />
              </ErrorBoundary>
            </div>

            {/* VISTAPRINT-STYLE DESKTOP LAYOUT: Compact Sidebar + Dominant Preview */}
            <div className="hidden lg:flex lg:gap-10">
              {/* CONSOLIDATED SIDEBAR - Compact Controls */}
              <div className="w-96 flex-shrink-0 space-y-8">
                <SizeQuantityCard />
                <MaterialCard />
                <OptionsCard />
              </div>

              {/* DOMINANT PREVIEW AREA - Vistaprint Style */}
              <div className="flex-1 min-w-0 space-y-8">
                <LivePreviewCard 
                  onOpenAIModal={handleOpenAIModal} 
                  expanded={true}
                />
                {/* Pricing Card - Below Preview */}
                <ErrorBoundary>
                  <PricingCard />
                </ErrorBoundary>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* AI Generation Modal */}
      <NewAIGenerationModal 
        open={aiModalOpen} 
        onOpenChange={setAiModalOpen} 
      />
    </Layout>
  );
};

export default Design;
