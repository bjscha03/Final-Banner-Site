import React from 'react';
import { Square, Circle, Triangle, Minus, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEditorStore } from '@/store/editor';
import { useQuoteStore } from '@/store/quote';

const ShapesPanel: React.FC = () => {
  const addObject = useEditorStore((state) => state.addObject);
  const { widthIn, heightIn } = useQuoteStore();

  const handleAddShape = (shapeType: 'rect' | 'circle' | 'triangle' | 'line' | 'arrow') => {
    console.log('[SHAPE ADD] Adding shape:', shapeType);
    const baseSize = 3; // 3 inches

    // For lines and arrows, use different dimensions
    let width = baseSize;
    let height = baseSize;
    let strokeWidth = 2;
    
    if (shapeType === 'line' || shapeType === 'arrow') {
      width = 4; // 4 inches long
      height = 0.1; // Very small height (just for bounding box)
      strokeWidth = 3; // Thicker stroke so it's visible and clickable
    }

    const shapeObject = {
      type: 'shape',
      shapeType,
      x: widthIn / 2 - width / 2,
      y: heightIn / 2 - height / 2,
      width,
      height,
      rotation: 0,
      opacity: 1,
      locked: false,
      visible: true,
      fill: shapeType === 'line' || shapeType === 'arrow' ? 'transparent' : '#18448D',
      stroke: '#0f2d5c',
      strokeWidth,
      cornerRadius: shapeType === 'rect' ? 0 : undefined,
    };
    
    console.log('[SHAPE ADD] Shape object:', shapeObject);
    addObject(shapeObject);
    console.log('[SHAPE ADD] Shape added successfully');
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">Shapes & Lines</h3>
      <div className="grid grid-cols-2 gap-2">
        <Button 
          variant="outline" 
          className="h-20 flex-col"
          onClick={() => handleAddShape('rect')}
        >
          <Square className="h-6 w-6 mb-1" />
          <span className="text-xs">Rectangle</span>
        </Button>
        <Button 
          variant="outline" 
          className="h-20 flex-col"
          onClick={() => handleAddShape('circle')}
        >
          <Circle className="h-6 w-6 mb-1" />
          <span className="text-xs">Circle</span>
        </Button>
        <Button 
          variant="outline" 
          className="h-20 flex-col"
          onClick={() => handleAddShape('triangle')}
        >
          <Triangle className="h-6 w-6 mb-1" />
          <span className="text-xs">Triangle</span>
        </Button>
        <Button 
          variant="outline" 
          className="h-20 flex-col"
          onClick={() => handleAddShape('line')}
        >
          <Minus className="h-6 w-6 mb-1" />
          <span className="text-xs">Line</span>
        </Button>
        <Button 
          variant="outline" 
          className="h-20 flex-col col-span-2"
          onClick={() => handleAddShape('arrow')}
        >
          <ArrowRight className="h-6 w-6 mb-1" />
          <span className="text-xs">Arrow</span>
        </Button>
      </div>
    </div>
  );
};

export default ShapesPanel;
