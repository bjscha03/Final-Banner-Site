import React, { useState } from 'react';
import { useEditorStore } from '@/store/editor';
import { Check, Palette } from 'lucide-react';
import { HexColorPicker } from 'react-colorful';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

const BrandColorsPanel: React.FC = () => {
  const { getSelectedObjects, updateObject } = useEditorStore();
  const selectedObjects = getSelectedObjects();
  const selectedObject = selectedObjects.length === 1 ? selectedObjects[0] : null;
  
  const [customColor, setCustomColor] = useState('#000000');
  const [showPicker, setShowPicker] = useState(false);

  const brandColors = [
    { name: 'Brand Blue', color: '#18448D' },
    { name: 'Orange', color: '#ff6b35' },
    { name: 'Alt Orange', color: '#f7931e' },
  ];

  const quickColors = [
    { name: 'Black', color: '#000000' },
    { name: 'White', color: '#FFFFFF' },
    { name: 'Red', color: '#ef4444' },
    { name: 'Green', color: '#22c55e' },
    { name: 'Blue', color: '#3b82f6' },
    { name: 'Yellow', color: '#eab308' },
  ];

  const getCurrentColor = () => {
    if (!selectedObject) return null;
    if (selectedObject.type === 'text') {
      return (selectedObject as any).color || '#000000';
    } else if (selectedObject.type === 'shape') {
      return (selectedObject as any).fill || '#18448D';
    }
    return null;
  };

  const handleColorClick = (color: string) => {
    if (!selectedObject) return;

    if (selectedObject.type === 'text') {
      updateObject(selectedObject.id, { color });
    } else if (selectedObject.type === 'shape') {
      updateObject(selectedObject.id, { fill: color });
    }
  };

  const handleCustomColorChange = (color: string) => {
    setCustomColor(color);
    handleColorClick(color);
  };

  const handleHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      handleCustomColorChange(value);
    }
  };

  const currentColor = getCurrentColor();
  const objectType = selectedObject?.type === 'text' ? 'text' : selectedObject?.type === 'shape' ? 'shape' : null;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-3">Brand Colors</h3>
        <div className="grid grid-cols-3 gap-2">
          {brandColors.map((item) => (
            <button
              key={item.color}
              onClick={() => handleColorClick(item.color)}
              disabled={!selectedObject}
              className={`relative h-12 rounded border-2 transition-all ${
                currentColor === item.color
                  ? 'border-blue-500 ring-2 ring-blue-200'
                  : 'border-gray-300 hover:border-gray-400'
              } ${!selectedObject ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              style={{ backgroundColor: item.color }}
              title={item.name}
            >
              {currentColor === item.color && (
                <Check className="absolute inset-0 m-auto w-5 h-5 text-white drop-shadow-lg" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3">Quick Colors</h3>
        <div className="grid grid-cols-6 gap-2">
          {quickColors.map((item) => (
            <button
              key={item.color}
              onClick={() => handleColorClick(item.color)}
              disabled={!selectedObject}
              className={`relative h-10 rounded border-2 transition-all ${
                currentColor === item.color
                  ? 'border-blue-500 ring-2 ring-blue-200'
                  : item.color === '#FFFFFF' ? 'border-gray-300' : 'border-gray-200'
              } ${!selectedObject ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              style={{ backgroundColor: item.color }}
              title={item.name}
            >
              {currentColor === item.color && (
                <Check className={`absolute inset-0 m-auto w-4 h-4 ${item.color === '#FFFFFF' ? 'text-gray-800' : 'text-white'} drop-shadow-lg`} />
              )}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3">Custom Color</h3>
        <Popover open={showPicker} onOpenChange={setShowPicker}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              disabled={!selectedObject}
              className="w-full justify-start gap-2"
            >
              <div
                className="w-6 h-6 rounded border border-gray-300"
                style={{ backgroundColor: customColor }}
              />
              <span className="flex-1 text-left">{customColor.toUpperCase()}</span>
              <Palette className="w-4 h-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3" align="start">
            <div className="space-y-3">
              <HexColorPicker color={customColor} onChange={handleCustomColorChange} />
              <div className="space-y-2">
                <Label htmlFor="hex-input" className="text-xs">Hex Color</Label>
                <Input
                  id="hex-input"
                  type="text"
                  value={customColor}
                  onChange={(e) => setCustomColor(e.target.value)}
                  onBlur={handleHexInputChange}
                  placeholder="#000000"
                  className="font-mono text-sm"
                />
              </div>
              <Button
                onClick={() => {
                  handleColorClick(customColor);
                  setShowPicker(false);
                }}
                className="w-full"
                size="sm"
              >
                Apply Color
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {!selectedObject && (
        <p className="text-xs text-gray-500 italic">
          Select a text or shape object to change its color
        </p>
      )}

      {selectedObject && objectType && (
        <p className="text-xs text-gray-600">
          Changing {objectType === 'text' ? 'text color' : 'fill color'} for selected {objectType}
        </p>
      )}
    </div>
  );
};

export default BrandColorsPanel;
