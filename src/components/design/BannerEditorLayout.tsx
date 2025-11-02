import React, { useState, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useEditorStore } from '@/store/editor';
import { useQuoteStore } from '@/store/quote';
import EditorToolbar from './editor/EditorToolbar';
import AssetsPanel from './editor/AssetsPanel';
import ShapesPanel from './editor/ShapesPanel';
import TextPanel from './editor/TextPanel';
import EditorCanvas from './editor/EditorCanvas';
import ObjectInspector from './editor/ObjectInspector';
import BrandColorsPanel from './editor/BrandColorsPanel';
import TemplatesPanel from './editor/TemplatesPanel';
import CanvasSettingsPanel from './editor/CanvasSettingsPanel';

interface BannerEditorLayoutProps {
  onOpenAIModal?: () => void;
}

const BannerEditorLayout: React.FC<BannerEditorLayoutProps> = ({ onOpenAIModal }) => {
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const canvasRef = useRef<any>(null);
  const { toast } = useToast();
  const { objects, exportToJSON } = useEditorStore();
  const { widthIn, heightIn, set: setQuote } = useQuoteStore();

  const handleExport = async (format: 'print-pdf' | 'proof-pdf' | 'png') => {
    console.log('[BannerEditorLayout] Export started:', format);
    
    if (!canvasRef.current) {
      console.error('[BannerEditorLayout] Canvas ref not available');
      toast({
        title: 'Export Failed',
        description: 'Canvas not ready. Please try again.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const stage = canvasRef.current.getStage();
      if (!stage) {
        throw new Error('Stage not found');
      }

      console.log('[BannerEditorLayout] Exporting from stage:', { widthIn, heightIn });

      if (format === 'png') {
        // Export as PNG
        const dataURL = stage.toDataURL({
          pixelRatio: 3, // High resolution (3x)
          mimeType: 'image/png',
        });

        // Download the image
        const link = document.createElement('a');
        link.download = `banner-design-${Date.now()}.png`;
        link.href = dataURL;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        console.log('[BannerEditorLayout] PNG export complete');
        toast({
          title: 'Export Successful',
          description: 'Your banner has been exported as PNG.',
        });
      } else {
        // PDF export (placeholder - would need jsPDF integration)
        toast({
          title: 'Coming Soon',
          description: 'PDF export will be available soon. Use PNG export for now.',
        });
      }
    } catch (error) {
      console.error('[BannerEditorLayout] Export error:', error);
      toast({
        title: 'Export Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleSave = () => {
    console.log('[BannerEditorLayout] Save started');
    console.log('[BannerEditorLayout] Current objects:', objects);

    try {
      // Export canvas design as JSON
      const designJSON = exportToJSON();
      console.log('[BannerEditorLayout] Design JSON:', designJSON);

      // Save to quote store so it appears on main design page
      setQuote({
        canvasDesign: designJSON,
        hasCanvasDesign: true,
      });

      toast({
        title: 'Design Saved',
        description: 'Your banner design has been saved successfully.',
      });

      console.log('[BannerEditorLayout] Save complete');
    } catch (error) {
      console.error('[BannerEditorLayout] Save error:', error);
      toast({
        title: 'Save Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <EditorToolbar 
        onOpenAIModal={onOpenAIModal}
        onExport={handleExport}
        onSave={handleSave}
      />
      <div className="flex flex-1 overflow-hidden">
        <Card className="w-80 m-4 mr-2 overflow-y-auto">
          <Tabs defaultValue="uploads" className="w-full">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="uploads">Uploads</TabsTrigger>
              <TabsTrigger value="shapes">Shapes</TabsTrigger>
              <TabsTrigger value="text">Text</TabsTrigger>
            </TabsList>
            <div className="p-4">
              <TabsContent value="uploads" className="mt-0">
                <AssetsPanel />
              </TabsContent>
              <TabsContent value="shapes" className="mt-0">
                <ShapesPanel />
              </TabsContent>
              <TabsContent value="text" className="mt-0">
                <TextPanel />
              </TabsContent>
            </div>
          </Tabs>
        </Card>
        <div className="flex-1 m-4 mx-2 overflow-auto">
          <EditorCanvas 
            ref={canvasRef}
            selectedObjectId={selectedObjectId}
            onSelectObject={setSelectedObjectId}
          />
        </div>
        <Card className="w-80 m-4 ml-2 overflow-y-auto">
          <Tabs defaultValue="inspector" className="w-full">
            <TabsList className="w-full grid grid-cols-4">
              <TabsTrigger value="inspector">Inspector</TabsTrigger>
              <TabsTrigger value="colors">Colors</TabsTrigger>
              <TabsTrigger value="canvas">Canvas</TabsTrigger>
              <TabsTrigger value="layouts">Layouts</TabsTrigger>
            </TabsList>
            <div className="p-4">
              <TabsContent value="inspector" className="mt-0">
                <ObjectInspector selectedObjectId={selectedObjectId} />
              </TabsContent>
              <TabsContent value="colors" className="mt-0">
                <BrandColorsPanel selectedObjectId={selectedObjectId} />
              </TabsContent>
              <TabsContent value="canvas" className="mt-0">
                <CanvasSettingsPanel />
              </TabsContent>
              <TabsContent value="layouts" className="mt-0">
                <TemplatesPanel />
              </TabsContent>
            </div>
          </Tabs>
        </Card>
      </div>
    </div>
  );
};

export default BannerEditorLayout;
