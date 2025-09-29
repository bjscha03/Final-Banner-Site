import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import LivePreviewCard from '@/components/design/LivePreviewCard';
import CheckoutSummary from '@/components/design/CheckoutSummary';
import AccordionSection from '@/components/design/AccordionSection';
import SizeQuantityCard from '@/components/design/SizeQuantityCard';
import MaterialCard from '@/components/design/MaterialCard';
import OptionsCard from '@/components/design/OptionsCard';
import { useQuoteStore, MaterialKey } from '@/store/quote';
import { useToast } from '@/components/ui/use-toast';
import AIGenerationModal from '@/components/design/AIGenerationModal';
import { Ruler, Palette, Settings } from 'lucide-react';

const Design: React.FC = () => {
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const { material, set } = useQuoteStore();
  const { toast } = useToast();

  // Handle material changes from URL or other sources
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const materialParam = urlParams.get('material') as MaterialKey;
    
    if (materialParam && ['vinyl', 'mesh', 'fabric'].includes(materialParam)) {
      set({ material: materialParam });
      
      // Show material selection feedback
      const materialNames = {
        vinyl: 'Premium Vinyl',
        mesh: 'Mesh Banner',
        fabric: 'Fabric Banner'
      };
      
      toast({
        title: `${materialNames[materialParam]} Selected`,
        description: 'Material has been updated for your banner design.',
      });
    }
  }, [set, toast]);

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 py-8 relative">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-blue-300/20 to-transparent rounded-full blur-3xl transform -translate-x-1/2 -translate-y-1/2"></div>
          <div className="absolute top-1/3 right-0 w-80 h-80 bg-gradient-to-bl from-indigo-300/20 to-transparent rounded-full blur-3xl transform translate-x-1/2"></div>
          <div className="absolute bottom-0 left-1/3 w-72 h-72 bg-gradient-to-tr from-purple-300/20 to-transparent rounded-full blur-3xl transform translate-y-1/2"></div>
        </div>

        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          {/* Page Header */}
          <div className="text-center mb-8 md:mb-12">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold bg-gradient-to-r from-gray-900 via-blue-800 to-indigo-800 bg-clip-text text-transparent mb-4 md:mb-6">
              Design Your Custom Banner
            </h1>
            <p className="text-lg md:text-xl text-gray-700 max-w-3xl mx-auto">
              Create professional banners with our easy-to-use design tool.
              See live previews and get instant pricing as you customize.
            </p>
          </div>

          {/* Main Preview Card */}
          <div className="max-w-5xl mx-auto mb-8">
            <LivePreviewCard expanded={true} onOpenAIModal={() => setAiModalOpen(true)} />
            <CheckoutSummary />
          </div>

          {/* Configuration Accordions */}
          <div className="max-w-4xl mx-auto space-y-6">
            <AccordionSection
              title="Size & Quantity"
              icon={<Ruler className="w-4 h-4 text-white" />}
              defaultOpen={false}
            >
              <SizeQuantityCard />
            </AccordionSection>

            <AccordionSection
              title="Material"
              icon={<Palette className="w-4 h-4 text-white" />}
              defaultOpen={false}
            >
              <MaterialCard />
            </AccordionSection>

            <AccordionSection
              title="Options"
              icon={<Settings className="w-4 h-4 text-white" />}
              defaultOpen={false}
            >
              <OptionsCard />
            </AccordionSection>
          </div>
        </div>
      </div>

      {/* AI Generation Modal */}
      <AIGenerationModal 
        open={aiModalOpen} 
        onOpenChange={setAiModalOpen} 
      />
    </Layout>
  );
};

export default Design;
