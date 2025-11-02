import React from 'react';
import { useEditorStore } from '@/store/editor';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Lock, Unlock, Eye, EyeOff, Trash2 } from 'lucide-react';

interface ObjectInspectorProps {
  selectedObjectId: string | null;
}

const ObjectInspector: React.FC<ObjectInspectorProps> = ({ selectedObjectId }) => {
  const { 
    selectedIds, 
    getSelectedObjects, 
    updateObject, 
    lockObject, 
    toggleVisibility,
    deleteSelected,
    bringToFront,
    sendToBack,
  } = useEditorStore();

  const selectedObjects = getSelectedObjects();
  const selectedObject = selectedObjects.length === 1 ? selectedObjects[0] : null;

  if (!selectedObject) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">Properties</h3>
        <p className="text-sm text-gray-400">
          {selectedIds.length === 0 
            ? 'No object selected' 
            : `${selectedIds.length} objects selected`}
        </p>
        {selectedIds.length > 1 && (
          <div className="space-y-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full"
              onClick={() => deleteSelected()}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Selected
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Properties</h3>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => lockObject(selectedObject.id, !selectedObject.locked)}
          >
            {selectedObject.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleVisibility(selectedObject.id)}
          >
            {selectedObject.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => deleteSelected()}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Position */}
      <div className="space-y-2">
        <Label className="text-xs">Position</Label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-gray-500">X (in)</Label>
            <Input
              type="number"
              step="0.1"
              value={selectedObject.x.toFixed(2)}
              onChange={(e) => updateObject(selectedObject.id, { x: parseFloat(e.target.value) || 0 })}
              className="h-8"
            />
          </div>
          <div>
            <Label className="text-xs text-gray-500">Y (in)</Label>
            <Input
              type="number"
              step="0.1"
              value={selectedObject.y.toFixed(2)}
              onChange={(e) => updateObject(selectedObject.id, { y: parseFloat(e.target.value) || 0 })}
              className="h-8"
            />
          </div>
        </div>
      </div>

      {/* Size */}
      <div className="space-y-2">
        <Label className="text-xs">Size</Label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-gray-500">W (in)</Label>
            <Input
              type="number"
              step="0.1"
              value={selectedObject.width.toFixed(2)}
              onChange={(e) => updateObject(selectedObject.id, { width: parseFloat(e.target.value) || 0.1 })}
              className="h-8"
            />
          </div>
          <div>
            <Label className="text-xs text-gray-500">H (in)</Label>
            <Input
              type="number"
              step="0.1"
              value={selectedObject.height.toFixed(2)}
              onChange={(e) => updateObject(selectedObject.id, { height: parseFloat(e.target.value) || 0.1 })}
              className="h-8"
            />
          </div>
        </div>
      </div>

      {/* Rotation */}
      <div className="space-y-2">
        <Label className="text-xs">Rotation: {selectedObject.rotation.toFixed(0)}°</Label>
        <Slider
          value={[selectedObject.rotation]}
          onValueChange={([value]) => updateObject(selectedObject.id, { rotation: value })}
          min={0}
          max={360}
          step={1}
        />
      </div>

      {/* Opacity */}
      <div className="space-y-2">
        <Label className="text-xs">Opacity: {Math.round(selectedObject.opacity * 100)}%</Label>
        <Slider
          value={[selectedObject.opacity * 100]}
          onValueChange={([value]) => updateObject(selectedObject.id, { opacity: value / 100 })}
          min={0}
          max={100}
          step={1}
        />
      </div>

      {/* Text-specific properties */}
      {selectedObject.type === 'text' && (
        <>
          <div className="space-y-2">
            <Label className="text-xs">Text Content</Label>
            <Input
              value={selectedObject.content}
              onChange={(e) => updateObject(selectedObject.id, { content: e.target.value })}
              className="h-8"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Font Size</Label>
            <Input
              type="number"
              value={selectedObject.fontSize}
              onChange={(e) => updateObject(selectedObject.id, { fontSize: parseInt(e.target.value) || 12 })}
              className="h-8"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Font Family</Label>
            <Select
              value={selectedObject.fontFamily || 'Arial'}
              onValueChange={(value) => {
                console.log('[FONT CHANGE] Changing font to:', value);
                updateObject(selectedObject.id, { fontFamily: value });
              }}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                <SelectItem value="Arial" style={{ fontFamily: 'Arial' }}>Arial</SelectItem>
                <SelectItem value="Helvetica" style={{ fontFamily: 'Helvetica' }}>Helvetica</SelectItem>
                <SelectItem value="Times New Roman" style={{ fontFamily: 'Times New Roman' }}>Times New Roman</SelectItem>
                <SelectItem value="Georgia" style={{ fontFamily: 'Georgia' }}>Georgia</SelectItem>
                <SelectItem value="Courier New" style={{ fontFamily: 'Courier New' }}>Courier New</SelectItem>
                <SelectItem value="Verdana" style={{ fontFamily: 'Verdana' }}>Verdana</SelectItem>
                <SelectItem value="Trebuchet MS" style={{ fontFamily: 'Trebuchet MS' }}>Trebuchet MS</SelectItem>
                <SelectItem value="Impact" style={{ fontFamily: 'Impact' }}>Impact</SelectItem>
                <SelectItem value="Comic Sans MS" style={{ fontFamily: 'Comic Sans MS' }}>Comic Sans MS</SelectItem>
                <SelectItem value="Palatino" style={{ fontFamily: 'Palatino' }}>Palatino</SelectItem>
                <SelectItem value="Garamond" style={{ fontFamily: 'Garamond' }}>Garamond</SelectItem>
                <SelectItem value="Bookman" style={{ fontFamily: 'Bookman' }}>Bookman</SelectItem>
                <SelectItem value="Tahoma" style={{ fontFamily: 'Tahoma' }}>Tahoma</SelectItem>
                <SelectItem value="Lucida Console" style={{ fontFamily: 'Lucida Console' }}>Lucida Console</SelectItem>
                <SelectItem value="Monaco" style={{ fontFamily: 'Monaco' }}>Monaco</SelectItem>
                <SelectItem value="Consolas" style={{ fontFamily: 'Consolas' }}>Consolas</SelectItem>
                <SelectItem value="Roboto" style={{ fontFamily: 'Roboto' }}>Roboto</SelectItem>
                <SelectItem value="Open Sans" style={{ fontFamily: 'Open Sans' }}>Open Sans</SelectItem>
                <SelectItem value="Lato" style={{ fontFamily: 'Lato' }}>Lato</SelectItem>
                <SelectItem value="Montserrat" style={{ fontFamily: 'Montserrat' }}>Montserrat</SelectItem>
                <SelectItem value="Oswald" style={{ fontFamily: 'Oswald' }}>Oswald</SelectItem>
                <SelectItem value="Raleway" style={{ fontFamily: 'Raleway' }}>Raleway</SelectItem>
                <SelectItem value="PT Sans" style={{ fontFamily: 'PT Sans' }}>PT Sans</SelectItem>
                <SelectItem value="Merriweather" style={{ fontFamily: 'Merriweather' }}>Merriweather</SelectItem>
                <SelectItem value="Playfair Display" style={{ fontFamily: 'Playfair Display' }}>Playfair Display</SelectItem>
                <SelectItem value="Nunito" style={{ fontFamily: 'Nunito' }}>Nunito</SelectItem>
                <SelectItem value="Poppins" style={{ fontFamily: 'Poppins' }}>Poppins</SelectItem>
                <SelectItem value="Ubuntu" style={{ fontFamily: 'Ubuntu' }}>Ubuntu</SelectItem>
                <SelectItem value="Mukta" style={{ fontFamily: 'Mukta' }}>Mukta</SelectItem>
                <SelectItem value="Rubik" style={{ fontFamily: 'Rubik' }}>Rubik</SelectItem>
                <SelectItem value="Work Sans" style={{ fontFamily: 'Work Sans' }}>Work Sans</SelectItem>
                <SelectItem value="Noto Sans" style={{ fontFamily: 'Noto Sans' }}>Noto Sans</SelectItem>
                <SelectItem value="Fira Sans" style={{ fontFamily: 'Fira Sans' }}>Fira Sans</SelectItem>
                <SelectItem value="Quicksand" style={{ fontFamily: 'Quicksand' }}>Quicksand</SelectItem>
                <SelectItem value="Karla" style={{ fontFamily: 'Karla' }}>Karla</SelectItem>
                <SelectItem value="Barlow" style={{ fontFamily: 'Barlow' }}>Barlow</SelectItem>
                <SelectItem value="Oxygen" style={{ fontFamily: 'Oxygen' }}>Oxygen</SelectItem>
                <SelectItem value="Cabin" style={{ fontFamily: 'Cabin' }}>Cabin</SelectItem>
                <SelectItem value="Bebas Neue" style={{ fontFamily: 'Bebas Neue' }}>Bebas Neue</SelectItem>
                <SelectItem value="Anton" style={{ fontFamily: 'Anton' }}>Anton</SelectItem>
                <SelectItem value="Pacifico" style={{ fontFamily: 'Pacifico' }}>Pacifico</SelectItem>
                <SelectItem value="Dancing Script" style={{ fontFamily: 'Dancing Script' }}>Dancing Script</SelectItem>
                <SelectItem value="Lobster" style={{ fontFamily: 'Lobster' }}>Lobster</SelectItem>
                <SelectItem value="Righteous" style={{ fontFamily: 'Righteous' }}>Righteous</SelectItem>
                <SelectItem value="Permanent Marker" style={{ fontFamily: 'Permanent Marker' }}>Permanent Marker</SelectItem>
                <SelectItem value="Indie Flower" style={{ fontFamily: 'Indie Flower' }}>Indie Flower</SelectItem>
                <SelectItem value="Shadows Into Light" style={{ fontFamily: 'Shadows Into Light' }}>Shadows Into Light</SelectItem>
                <SelectItem value="Satisfy" style={{ fontFamily: 'Satisfy' }}>Satisfy</SelectItem>
                <SelectItem value="Caveat" style={{ fontFamily: 'Caveat' }}>Caveat</SelectItem>
                <SelectItem value="Amatic SC" style={{ fontFamily: 'Amatic SC' }}>Amatic SC</SelectItem>
                <SelectItem value="Architects Daughter" style={{ fontFamily: 'Architects Daughter' }}>Architects Daughter</SelectItem>
                <SelectItem value="Kalam" style={{ fontFamily: 'Kalam' }}>Kalam</SelectItem>
                <SelectItem value="Roboto Mono" style={{ fontFamily: 'Roboto Mono' }}>Roboto Mono</SelectItem>
                <SelectItem value="Source Code Pro" style={{ fontFamily: 'Source Code Pro' }}>Source Code Pro</SelectItem>
                <SelectItem value="IBM Plex Mono" style={{ fontFamily: 'IBM Plex Mono' }}>IBM Plex Mono</SelectItem>
                <SelectItem value="JetBrains Mono" style={{ fontFamily: 'JetBrains Mono' }}>JetBrains Mono</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Color</Label>
            <Input
              type="color"
              value={selectedObject.color}
              onChange={(e) => updateObject(selectedObject.id, { color: e.target.value })}
              className="h-8"
            />
          </div>
        </>
      )}

      {/* Shape-specific properties */}
      {selectedObject.type === 'shape' && (
        <>
          <div className="space-y-2">
            <Label className="text-xs">Fill Color</Label>
            <Input
              type="color"
              value={selectedObject.fill}
              onChange={(e) => updateObject(selectedObject.id, { fill: e.target.value })}
              className="h-8"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Stroke Color</Label>
            <Input
              type="color"
              value={selectedObject.stroke}
              onChange={(e) => updateObject(selectedObject.id, { stroke: e.target.value })}
              className="h-8"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Stroke Width</Label>
            <Input
              type="number"
              value={selectedObject.strokeWidth}
              onChange={(e) => updateObject(selectedObject.id, { strokeWidth: parseInt(e.target.value) || 1 })}
              className="h-8"
            />
          </div>
        </>
      )}

      {/* Z-order */}
      <div className="space-y-2">
        <Label className="text-xs">Layer Order</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => bringToFront(selectedObject.id)}
          >
            To Front
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => sendToBack(selectedObject.id)}
          >
            To Back
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ObjectInspector;
