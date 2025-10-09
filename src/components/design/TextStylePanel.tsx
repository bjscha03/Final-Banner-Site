import React from 'react';
import { Type, AlignLeft, AlignCenter, AlignRight, Bold } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import type { TextElement } from '@/store/quote';

interface TextStylePanelProps {
  selectedElement: TextElement | null;
  onUpdate: (updates: Partial<TextElement>) => void;
}

const FONT_FAMILIES = [
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Impact, sans-serif', label: 'Impact' },
  { value: '"Times New Roman", serif', label: 'Times New Roman' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
  { value: '"Courier New", monospace', label: 'Courier New' },
  { value: '"Comic Sans MS", cursive', label: 'Comic Sans MS' },
  { value: '"Trebuchet MS", sans-serif', label: 'Trebuchet MS' },
];

const PRESET_COLORS = [
  '#000000', '#FFFFFF', '#FF0000', '#00FF00',
  '#0000FF', '#FFFF00', '#FF6B35', '#808080',
];

const TextStylePanel: React.FC<TextStylePanelProps> = ({ selectedElement, onUpdate }) => {
  if (!selectedElement) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-sm text-gray-500 text-center">
          Select a text element to edit its style
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="flex items-center gap-2 pb-2 border-b">
        <Type className="w-4 h-4 text-gray-600" />
        <h3 className="font-semibold text-sm">Text Styling</h3>
      </div>

      <div className="space-y-2">
        <Label htmlFor="font-family" className="text-xs font-medium">Font Family</Label>
        <select
          id="font-family"
          value={selectedElement.fontFamily}
          onChange={(e) => onUpdate({ fontFamily: e.target.value })}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          {FONT_FAMILIES.map((font) => (
            <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
              {font.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <Label htmlFor="font-size" className="text-xs font-medium">Font Size</Label>
          <span className="text-xs text-gray-600">{selectedElement.fontSize}pt</span>
        </div>
        <Slider
          id="font-size"
          min={12}
          max={200}
          step={1}
          value={[selectedElement.fontSize]}
          onValueChange={([value]) => onUpdate({ fontSize: value })}
          className="w-full"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium">Text Color</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={selectedElement.color}
            onChange={(e) => onUpdate({ color: e.target.value })}
            className="w-12 h-10 rounded border border-gray-300 cursor-pointer"
          />
          <input
            type="text"
            value={selectedElement.color}
            onChange={(e) => onUpdate({ color: e.target.value })}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="#000000"
          />
        </div>
        <div className="grid grid-cols-8 gap-1 mt-2">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              onClick={() => onUpdate({ color })}
              className={`w-8 h-8 rounded border-2 ${
                selectedElement.color.toUpperCase() === color.toUpperCase()
                  ? 'border-orange-500'
                  : 'border-gray-300'
              }`}
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium">Text Alignment</Label>
        <div className="flex gap-1">
          <Button
            variant={selectedElement.textAlign === 'left' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onUpdate({ textAlign: 'left' })}
            className="flex-1"
          >
            <AlignLeft className="w-4 h-4" />
          </Button>
          <Button
            variant={selectedElement.textAlign === 'center' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onUpdate({ textAlign: 'center' })}
            className="flex-1"
          >
            <AlignCenter className="w-4 h-4" />
          </Button>
          <Button
            variant={selectedElement.textAlign === 'right' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onUpdate({ textAlign: 'right' })}
            className="flex-1"
          >
            <AlignRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium">Font Weight</Label>
        <div className="flex gap-2">
          <Button
            variant={selectedElement.fontWeight === 'normal' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onUpdate({ fontWeight: 'normal' })}
            className="flex-1"
          >
            Normal
          </Button>
          <Button
            variant={selectedElement.fontWeight === 'bold' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onUpdate({ fontWeight: 'bold' })}
            className="flex-1"
          >
            <Bold className="w-4 h-4 mr-1" />
            Bold
          </Button>
        </div>
      </div>

      <div className="space-y-2 pt-2 border-t">
        <Label className="text-xs font-medium">Preview</Label>
        <div
          className="p-4 bg-gray-100 rounded border border-gray-300 min-h-[60px] flex items-center justify-center"
          style={{
            fontFamily: selectedElement.fontFamily,
            fontSize: `${Math.min(selectedElement.fontSize, 24)}px`,
            color: selectedElement.color,
            fontWeight: selectedElement.fontWeight,
            textAlign: selectedElement.textAlign,
          }}
        >
          {selectedElement.content || 'Your text here'}
        </div>
      </div>
    </div>
  );
};

export default TextStylePanel;
