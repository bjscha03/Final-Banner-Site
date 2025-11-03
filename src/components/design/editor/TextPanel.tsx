import React from 'react';
import { Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEditorStore } from '@/store/editor';
import { useQuoteStore } from '@/store/quote';

const TextPanel: React.FC = () => {
  console.log('[TextPanel] Component rendered');
  const addObject = useEditorStore((state) => state.addObject);
  const { widthIn, heightIn } = useQuoteStore();

  const handleAddText = (preset: 'heading' | 'subheading' | 'body') => {
    console.log('[TextPanel] handleAddText called with preset:', preset);
    const presets = {
      heading: { fontSize: 6, fontWeight: 'bold' as const, color: '#18448D' },      // 6 inches
      subheading: { fontSize: 4, fontWeight: 'bold' as const, color: '#1f2937' },   // 4 inches
      body: { fontSize: 2, fontWeight: 'normal' as const, color: '#374151' },       // 2 inches
    };

    const config = presets[preset];
    const content = preset === 'heading' ? 'Heading Text' : preset === 'subheading' ? 'Subheading Text' : 'Body Text';

    // Calculate text width based on preset (rough estimate)
    const textWidth = preset === 'heading' ? widthIn * 0.6 : preset === 'subheading' ? widthIn * 0.5 : widthIn * 0.4;
    
    console.log('[TextPanel] Calling addObject with:', { type: 'text', content, x: widthIn / 2 - textWidth / 2, y: heightIn / 2 });
    addObject({
      type: 'text',
      content,
      x: widthIn / 2 - textWidth / 2,  // Center horizontally
      y: heightIn / 2 - config.fontSize / 2,  // Center vertically
      width: textWidth,
      height: config.fontSize * 1.5,
      rotation: 0,
      opacity: 1,
      locked: false,
      visible: true,
      fontFamily: 'Arial',
      fontSize: config.fontSize,
      color: config.color,
      fontWeight: config.fontWeight,
      fontStyle: 'normal',
      textDecoration: 'none',
      textAlign: 'center',
      lineHeight: 1.2,
      letterSpacing: 0,
      effect: 'none',
    });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">Add Text</h3>
      <div className="space-y-2">
        <Button 
          variant="outline" 
          className="w-full justify-start" 
          onClick={() => handleAddText('heading')}
        >
          <Type className="h-4 w-4 mr-2" />
          Add Heading
        </Button>
        <Button 
          variant="outline" 
          className="w-full justify-start" 
          onClick={() => handleAddText('subheading')}
        >
          <Type className="h-4 w-4 mr-2" />
          Add Subheading
        </Button>
        <Button 
          variant="outline" 
          className="w-full justify-start" 
          onClick={() => handleAddText('body')}
        >
          <Type className="h-4 w-4 mr-2" />
          Add Body Text
        </Button>
      </div>
    </div>
  );
};

export default TextPanel;
