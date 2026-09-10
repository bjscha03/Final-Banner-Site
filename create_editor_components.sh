#!/bin/bash

# Create EditorToolbar
cat > src/components/design/editor/EditorToolbar.tsx << 'EOF'
import React from 'react';
import { Button } from '@/components/ui/button';
import { Download, Save, Eye, Sparkles } from 'lucide-react';

interface EditorToolbarProps {
  onOpenAIModal?: () => void;
}

const EditorToolbar: React.FC<EditorToolbarProps> = ({ onOpenAIModal }) => {
  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-gray-900">Banner Editor</h2>
      </div>
      <div className="flex items-center gap-2">
        {onOpenAIModal && (
          <Button variant="outline" size="sm" onClick={onOpenAIModal}>
            <Sparkles className="h-4 w-4 mr-2" />
            AI Generate
          </Button>
        )}
        <Button variant="outline" size="sm">
          <Eye className="h-4 w-4 mr-2" />
          Preview
        </Button>
        <Button variant="outline" size="sm">
          <Save className="h-4 w-4 mr-2" />
          Save
        </Button>
        <Button variant="default" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>
    </div>
  );
};

export default EditorToolbar;
EOF

# Create AssetsPanel
cat > src/components/design/editor/AssetsPanel.tsx << 'EOF'
import React from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';

const AssetsPanel: React.FC = () => {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">Upload Files</h3>
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
        <Upload className="h-12 w-12 mx-auto text-gray-400 mb-2" />
        <p className="text-sm text-gray-600 mb-2">Drag & drop files here</p>
        <Button variant="outline" size="sm">Browse Files</Button>
      </div>
    </div>
  );
};

export default AssetsPanel;
EOF

# Create ShapesPanel
cat > src/components/design/editor/ShapesPanel.tsx << 'EOF'
import React from 'react';
import { Square, Circle, Triangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ShapesPanel: React.FC = () => {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">Shapes & Lines</h3>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-20 flex-col">
          <Square className="h-6 w-6 mb-1" />
          <span className="text-xs">Rectangle</span>
        </Button>
        <Button variant="outline" className="h-20 flex-col">
          <Circle className="h-6 w-6 mb-1" />
          <span className="text-xs">Circle</span>
        </Button>
        <Button variant="outline" className="h-20 flex-col">
          <Triangle className="h-6 w-6 mb-1" />
          <span className="text-xs">Triangle</span>
        </Button>
      </div>
    </div>
  );
};

export default ShapesPanel;
EOF

# Create TextPanel
cat > src/components/design/editor/TextPanel.tsx << 'EOF'
import React from 'react';
import { Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuoteStore } from '@/store/quote';

const TextPanel: React.FC = () => {
  const addTextElement = useQuoteStore((state) => state.addTextElement);

  const handleAddText = (preset: 'heading' | 'subheading' | 'body') => {
    const presets = {
      heading: { fontSize: 72, fontWeight: 'bold' as const, color: '#18448D' },
      subheading: { fontSize: 32, fontWeight: 'bold' as const, color: '#1f2937' },
      body: { fontSize: 24, fontWeight: 'normal' as const, color: '#374151' },
    };

    addTextElement({
      content: preset === 'heading' ? 'Heading Text' : preset === 'subheading' ? 'Subheading Text' : 'Body Text',
      xPercent: 50,
      yPercent: 50,
      fontSize: presets[preset].fontSize,
      fontFamily: 'Arial',
      color: presets[preset].color,
      fontWeight: presets[preset].fontWeight,
      textAlign: 'center',
      lineHeight: 1.2,
    });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">Add Text</h3>
      <div className="space-y-2">
        <Button variant="outline" className="w-full justify-start" onClick={() => handleAddText('heading')}>
          <Type className="h-4 w-4 mr-2" />
          Add Heading
        </Button>
        <Button variant="outline" className="w-full justify-start" onClick={() => handleAddText('subheading')}>
          <Type className="h-4 w-4 mr-2" />
          Add Subheading
        </Button>
        <Button variant="outline" className="w-full justify-start" onClick={() => handleAddText('body')}>
          <Type className="h-4 w-4 mr-2" />
          Add Body Text
        </Button>
      </div>
    </div>
  );
};

export default TextPanel;
EOF

# Create EditorCanvas
cat > src/components/design/editor/EditorCanvas.tsx << 'EOF'
import React from 'react';
import { Card } from '@/components/ui/card';
import { useQuoteStore } from '@/store/quote';

interface EditorCanvasProps {
  selectedObjectId: string | null;
  onSelectObject: (id: string | null) => void;
}

const EditorCanvas: React.FC<EditorCanvasProps> = ({ selectedObjectId, onSelectObject }) => {
  const { widthIn, heightIn, textElements } = useQuoteStore();

  return (
    <Card className="w-full h-full bg-gray-100 flex items-center justify-center p-8">
      <div className="bg-white shadow-lg relative" style={{ width: `${widthIn * 20}px`, height: `${heightIn * 20}px`, maxWidth: '100%', maxHeight: '100%' }}>
        {/* Bleed area */}
        <div className="absolute inset-0 border-2 border-red-200 pointer-events-none" />
        
        {/* Safety margin */}
        <div className="absolute inset-[15px] border-2 border-dashed border-blue-300 pointer-events-none" />
        
        {/* Text elements */}
        {textElements.map((text, idx) => (
          <div
            key={idx}
            className="absolute cursor-move hover:outline hover:outline-2 hover:outline-blue-500"
            style={{
              left: `${text.xPercent}%`,
              top: `${text.yPercent}%`,
              transform: 'translate(-50%, -50%)',
              fontSize: `${text.fontSize / 4}px`,
              fontFamily: text.fontFamily,
              color: text.color,
              fontWeight: text.fontWeight,
              textAlign: text.textAlign,
            }}
            onClick={() => onSelectObject(`text-${idx}`)}
          >
            {text.content}
          </div>
        ))}
        
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 pointer-events-none">
          <p className="text-sm">Canvas: {widthIn}" × {heightIn}"</p>
        </div>
      </div>
    </Card>
  );
};

export default EditorCanvas;
EOF

# Create ObjectInspector
cat > src/components/design/editor/ObjectInspector.tsx << 'EOF'
import React from 'react';

interface ObjectInspectorProps {
  selectedObjectId: string | null;
}

const ObjectInspector: React.FC<ObjectInspectorProps> = ({ selectedObjectId }) => {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">Properties</h3>
      {selectedObjectId ? (
        <p className="text-sm text-gray-600">Selected: {selectedObjectId}</p>
      ) : (
        <p className="text-sm text-gray-400">No object selected</p>
      )}
    </div>
  );
};

export default ObjectInspector;
EOF

# Create BrandColorsPanel
cat > src/components/design/editor/BrandColorsPanel.tsx << 'EOF'
import React from 'react';

interface BrandColorsPanelProps {
  selectedObjectId: string | null;
}

const BrandColorsPanel: React.FC<BrandColorsPanelProps> = ({ selectedObjectId }) => {
  const brandColors = [
    { name: 'Primary Blue', color: '#18448D' },
    { name: 'Orange', color: '#ff6b35' },
    { name: 'Alt Orange', color: '#f7931e' },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">Brand Colors</h3>
      <div className="grid grid-cols-3 gap-2">
        {brandColors.map((c) => (
          <div key={c.color} className="text-center">
            <div className="w-full h-12 rounded border border-gray-300 cursor-pointer hover:scale-105 transition-transform" style={{ backgroundColor: c.color }} />
            <p className="text-xs text-gray-600 mt-1">{c.name}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BrandColorsPanel;
EOF

# Create TemplatesPanel
cat > src/components/design/editor/TemplatesPanel.tsx << 'EOF'
import React from 'react';
import { Card } from '@/components/ui/card';

const TemplatesPanel: React.FC = () => {
  const templates = [
    { id: 1, name: 'Centered Headline', emoji: '📝' },
    { id: 2, name: 'Logo + Text', emoji: '🏢' },
    { id: 3, name: 'Bold Announcement', emoji: '📢' },
    { id: 4, name: 'Sale Banner', emoji: '🏷️' },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">Starter Layouts</h3>
      <div className="grid grid-cols-2 gap-3">
        {templates.map((t) => (
          <Card key={t.id} className="p-3 cursor-pointer hover:border-blue-500 transition-colors">
            <div className="aspect-video bg-gray-100 rounded mb-2 flex items-center justify-center text-3xl">
              {t.emoji}
            </div>
            <p className="text-xs font-semibold text-gray-900">{t.name}</p>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default TemplatesPanel;
EOF

echo "All editor components created successfully!"
