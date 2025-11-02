import React, { useState } from 'react';
import { useEditorStore } from '@/store/editor';
import { Paintbrush } from 'lucide-react';
import { HexColorPicker } from 'react-colorful';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

const CanvasSettingsPanel: React.FC = () => {
  const { canvasBackgroundColor, setCanvasBackgroundColor } = useEditorStore();
  const [showPicker, setShowPicker] = useState(false);
  const [tempColor, setTempColor] = useState(canvasBackgroundColor || '#FFFFFF');

  const presetBackgrounds = [
    { name: 'White', color: '#FFFFFF' },
    { name: 'Light Gray', color: '#F3F4F6' },
    { name: 'Cream', color: '#FFFBEB' },
    { name: 'Light Blue', color: '#EFF6FF' },
    { name: 'Black', color: '#000000' },
    { name: 'Navy', color: '#1E3A8A' },
  ];

  const handleColorChange = (color: string) => {
    setTempColor(color);
    setCanvasBackgroundColor(color);
  };

  const handleHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      handleColorChange(value);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-3">Canvas Background</h3>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {presetBackgrounds.map((preset) => (
            <button
              key={preset.color}
              onClick={() => handleColorChange(preset.color)}
              className={`h-12 rounded border-2 transition-all ${
                canvasBackgroundColor === preset.color
                  ? 'border-blue-500 ring-2 ring-blue-200'
                  : preset.color === '#FFFFFF' || preset.color === '#F3F4F6' || preset.color === '#FFFBEB' || preset.color === '#EFF6FF'
                  ? 'border-gray-300 hover:border-gray-400'
                  : 'border-gray-600 hover:border-gray-500'
              }`}
              style={{ backgroundColor: preset.color }}
              title={preset.name}
            >
              <span className={`text-xs font-medium ${
                preset.color === '#FFFFFF' || preset.color === '#F3F4F6' || preset.color === '#FFFBEB' || preset.color === '#EFF6FF'
                ? 'text-gray-700'
                : 'text-white'
              }`}>
                {preset.name}
              </span>
            </button>
          ))}
        </div>

        <Popover open={showPicker} onOpenChange={setShowPicker}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-start gap-2">
              <div
                className="w-6 h-6 rounded border border-gray-300"
                style={{ backgroundColor: canvasBackgroundColor }}
              />
              <span className="flex-1 text-left">{canvasBackgroundColor.toUpperCase()}</span>
              <Paintbrush className="w-4 h-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3" align="start">
            <div className="space-y-3">
              <HexColorPicker color={tempColor} onChange={handleColorChange} />
              <div className="space-y-2">
                <Label htmlFor="bg-hex-input" className="text-xs">Hex Color</Label>
                <Input
                  id="bg-hex-input"
                  type="text"
                  value={tempColor}
                  onChange={(e) => setTempColor(e.target.value)}
                  onBlur={handleHexInputChange}
                  placeholder="#FFFFFF"
                  className="font-mono text-sm"
                />
              </div>
              <Button
                onClick={() => {
                  handleColorChange(tempColor);
                  setShowPicker(false);
                }}
                className="w-full"
                size="sm"
              >
                Apply Background
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="text-xs text-gray-600 space-y-1">
        <p>💡 <strong>Tip:</strong> Choose a background color that complements your design.</p>
        <p>The background color will be included in exported images.</p>
      </div>
    </div>
  );
};

export default CanvasSettingsPanel;
