import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SizeQuantityCard from '@/components/design/SizeQuantityCard';
import MaterialCard from '@/components/design/MaterialCard';
import OptionsCard from '@/components/design/OptionsCard';
import PricingCard from '@/components/design/PricingCard';
import ObjectInspector from './ObjectInspector';
import BrandColorsPanel from './BrandColorsPanel';
import CanvasSettingsPanel from './CanvasSettingsPanel';

interface DesignOptionsPanelProps {
  selectedObjectId: string | null;
}

const DesignOptionsPanel: React.FC<DesignOptionsPanelProps> = ({ selectedObjectId }) => {
  return (
    <div className="h-full overflow-y-auto">
      <Tabs defaultValue="design" className="w-full">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="design">Design</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
        </TabsList>
        
        <div className="p-4">
          {/* Design Tab - Material, Size, Options, Pricing */}
          <TabsContent value="design" className="mt-0 space-y-4">
            <MaterialCard />
            <SizeQuantityCard />
            <OptionsCard />
            <PricingCard />
          </TabsContent>
          
          {/* Tools Tab - Inspector, Colors, Canvas */}
          <TabsContent value="tools" className="mt-0">
            <Tabs defaultValue="inspector" className="w-full">
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="inspector">Inspector</TabsTrigger>
                <TabsTrigger value="colors">Colors</TabsTrigger>
                <TabsTrigger value="canvas">Canvas</TabsTrigger>
              </TabsList>
              <div className="mt-4">
                <TabsContent value="inspector" className="mt-0">
                  <ObjectInspector selectedObjectId={selectedObjectId} />
                </TabsContent>
                <TabsContent value="colors" className="mt-0">
                  <BrandColorsPanel selectedObjectId={selectedObjectId} />
                </TabsContent>
                <TabsContent value="canvas" className="mt-0">
                  <CanvasSettingsPanel />
                </TabsContent>
              </div>
            </Tabs>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default DesignOptionsPanel;
