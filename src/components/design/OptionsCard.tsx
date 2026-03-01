import React, { useState } from 'react';
import { Circle, HelpCircle, Check } from 'lucide-react';
import { useQuoteStore, PolePocketSize, Grommets } from '@/store/quote';
import { useEditorStore } from '@/store/editor';
import { ropeCost, polePocketCost } from '@/lib/pricing';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';




const polePocketOptions = [
  { value: 'none', label: 'None' },
  { value: 'top', label: 'Top only' },
  { value: 'bottom', label: 'Bottom only' },
  { value: 'top-bottom', label: 'Top & Bottom' },
  { value: 'left', label: 'Left only' },
  { value: 'right', label: 'Right only' }
];

const polePocketSizeOptions = [
  { value: '1', label: '1 inch' },
  { value: '2', label: '2 inch' },
  { value: '3', label: '3 inch' },
  { value: '4', label: '4 inch' }
];

const OptionsCard: React.FC = () => {
  const { polePockets, polePocketSize, addRope, grommets, widthIn, heightIn, quantity, set } = useQuoteStore();
  const [showPolePocketInfo, setShowPolePocketInfo] = useState(false);
  const [showRopeInfo, setShowRopeInfo] = useState(false);

  const totalRopeCost = addRope ? ropeCost(widthIn, quantity) : 0;
  const totalPolePocketCost = polePocketCost(widthIn, heightIn, polePockets, quantity);
  const linearFeet = widthIn / 12;

  // Helper to calculate linear feet for pole pockets
  const calculateLinearFeet = () => {
    switch (polePockets) {
      case 'top':
      case 'bottom':
        return widthIn / 12;
      case 'left':
      case 'right':
        return heightIn / 12;
      case 'top-bottom':
        return (widthIn / 12) * 2;
      default:
        return 0;
    }
  };

  const polePocketLinearFeet = calculateLinearFeet();

  return (
    <div className="space-y-5">
      {/* Grommets Section - REORDERED: now first; radio buttons instead of toggle+dropdown */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 bg-blue-500 rounded-full"></div>
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Grommets
          </h4>
          <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded-full">FREE</span>
        </div>

        <div className="space-y-2">
          <label
            onClick={() => {
              const { setShowGrommets } = useEditorStore.getState();
              set({ grommets: 'none' as Grommets });
              setShowGrommets(false);
            }}
            className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
              grommets === 'none'
                ? "ring-2 ring-blue-500 bg-blue-50 shadow-md"
                : "bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
              grommets === 'none' ? "border-blue-500 bg-blue-500" : "border-gray-300 bg-white"
            }`}>
              {grommets === 'none' && <Circle className="w-2 h-2 text-white fill-white" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-900 text-sm">None</div>
              <p className="text-xs text-gray-500">No grommets</p>
            </div>
          </label>
          <label
            onClick={() => {
              const { setShowGrommets } = useEditorStore.getState();
              set({ grommets: '4-corners' as Grommets });
              setShowGrommets(true);
            }}
            className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
              grommets === '4-corners'
                ? "ring-2 ring-blue-500 bg-blue-50 shadow-md"
                : "bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
              grommets === '4-corners' ? "border-blue-500 bg-blue-500" : "border-gray-300 bg-white"
            }`}>
              {grommets === '4-corners' && <Circle className="w-2 h-2 text-white fill-white" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-900 text-sm">4 Corners</div>
              <p className="text-xs text-gray-500">One grommet in each corner</p>
            </div>
          </label>
          <label
            onClick={() => {
              const { setShowGrommets } = useEditorStore.getState();
              set({ grommets: 'top-corners' as Grommets });
              setShowGrommets(true);
            }}
            className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
              grommets === 'top-corners'
                ? "ring-2 ring-blue-500 bg-blue-50 shadow-md"
                : "bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
              grommets === 'top-corners' ? "border-blue-500 bg-blue-500" : "border-gray-300 bg-white"
            }`}>
              {grommets === 'top-corners' && <Circle className="w-2 h-2 text-white fill-white" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-900 text-sm">Top Corners</div>
              <p className="text-xs text-gray-500">Two grommets on top edge</p>
            </div>
          </label>
          <label
            onClick={() => {
              const { setShowGrommets } = useEditorStore.getState();
              set({ grommets: 'every-2-3ft' as Grommets });
              setShowGrommets(true);
            }}
            className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
              grommets === 'every-2-3ft'
                ? "ring-2 ring-blue-500 bg-blue-50 shadow-md"
                : "bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
              grommets === 'every-2-3ft' ? "border-blue-500 bg-blue-500" : "border-gray-300 bg-white"
            }`}>
              {grommets === 'every-2-3ft' && <Circle className="w-2 h-2 text-white fill-white" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-900 text-sm">Every 2-3 ft</div>
              <p className="text-xs text-gray-500">Spaced along edges</p>
            </div>
          </label>
          <label
            onClick={() => {
              const { setShowGrommets } = useEditorStore.getState();
              set({ grommets: 'every-1-2ft' as Grommets });
              setShowGrommets(true);
            }}
            className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
              grommets === 'every-1-2ft'
                ? "ring-2 ring-blue-500 bg-blue-50 shadow-md"
                : "bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
              grommets === 'every-1-2ft' ? "border-blue-500 bg-blue-500" : "border-gray-300 bg-white"
            }`}>
              {grommets === 'every-1-2ft' && <Circle className="w-2 h-2 text-white fill-white" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-900 text-sm">Every 1-2 ft</div>
              <p className="text-xs text-gray-500">Closely spaced along edges</p>
            </div>
          </label>
        </div>
      </div>

      {/* Pole Pockets Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 bg-orange-500 rounded-full"></div>
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Pole Pockets
          </h4>
          <button
            onMouseEnter={() => setShowPolePocketInfo(true)}
            onMouseLeave={() => setShowPolePocketInfo(false)}
            className="relative"
          >
            <HelpCircle className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 transition-colors" />
            {showPolePocketInfo && (
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg z-10">
                <div className="mb-2 font-medium">Pole Pockets</div>
                <div>Create a sleeve for inserting poles or rods. Perfect for hanging banners.</div>
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
              </div>
            )}
          </button>
        </div>

        {/* Pole Pocket Toggle Card */}
        <div
          onClick={() => {
            if (polePockets === 'none') {
              set({ polePockets: 'top' });
            } else {
              set({ polePockets: 'none' });
            }
          }}
          className={`relative cursor-pointer rounded-xl transition-all duration-200 overflow-hidden ${
            polePockets !== 'none'
              ? "ring-2 ring-orange-500 bg-orange-50 shadow-md"
              : "bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 hover:shadow-sm"
          }`}
        >
          <div className="flex items-center p-3 gap-3">
            {/* Selection indicator */}
            <div className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
              polePockets !== 'none'
                ? "border-orange-500 bg-orange-500"
                : "border-gray-300 bg-white"
            }`}>
              {polePockets !== 'none' && <Check className="w-4 h-4 text-white" />}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-900">Add Pole Pockets</div>
              <p className="text-xs text-gray-500">Sleeves for pole insertion</p>
            </div>

            {/* Price */}
            {totalPolePocketCost > 0 && (
              <div className="flex-shrink-0 text-right">
                <p className="text-base font-bold text-orange-600">
                  +${totalPolePocketCost.toFixed(2)}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Configuration options when enabled */}
        {polePockets !== 'none' && (
          <div className="space-y-3 pl-2 border-l-2 border-orange-200 ml-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Position</label>
              <Select value={polePockets} onValueChange={(value) => set({ polePockets: value })}>
                <SelectTrigger className="w-full bg-white">
                  <SelectValue placeholder="Choose position" />
                </SelectTrigger>
                <SelectContent>
                  {polePocketOptions.filter(option => option.value !== 'none').map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Size</label>
              <Select value={polePocketSize} onValueChange={(value) => set({ polePocketSize: value as PolePocketSize })}>
                <SelectTrigger className="w-full bg-white">
                  <SelectValue placeholder="Select size" />
                </SelectTrigger>
                <SelectContent>
                  {polePocketSizeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {totalPolePocketCost > 0 && (
              <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded-lg">
                <span className="font-medium">Cost:</span> $15 setup + {polePocketLinearFeet.toFixed(1)} ft × $2 = <span className="font-semibold text-gray-700">${totalPolePocketCost.toFixed(2)}</span>
              </div>
            )}
          </div>
        )}
      </div>


      {/* Rope Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 bg-amber-500 rounded-full"></div>
          <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Rope
          </h4>
          <button
            onMouseEnter={() => setShowRopeInfo(true)}
            onMouseLeave={() => setShowRopeInfo(false)}
            className="relative"
          >
            <HelpCircle className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 transition-colors" />
            {showRopeInfo && (
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-56 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg z-10">
                <div className="mb-2 font-medium">Rope Details</div>
                <div className="space-y-1">
                  <div>• $2 per linear foot</div>
                  <div>• Banner width: {widthIn}"</div>
                </div>
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
              </div>
            )}
          </button>
        </div>

        {/* Rope Toggle Card */}
        <div
          onClick={() => set({ addRope: !addRope })}
          className={`relative cursor-pointer rounded-xl transition-all duration-200 overflow-hidden ${
            addRope
              ? "ring-2 ring-amber-500 bg-amber-50 shadow-md"
              : "bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 hover:shadow-sm"
          }`}
        >
          <div className="flex items-center p-3 gap-3">
            {/* Selection indicator */}
            <div className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
              addRope
                ? "border-amber-500 bg-amber-500"
                : "border-gray-300 bg-white"
            }`}>
              {addRope && <Check className="w-4 h-4 text-white" />}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-900">Add Rope</div>
              <p className="text-xs text-gray-500">$2 per linear foot</p>
            </div>

            {/* Price */}
            {addRope && totalRopeCost > 0 && (
              <div className="flex-shrink-0 text-right">
                <p className="text-base font-bold text-amber-600">
                  +${totalRopeCost.toFixed(2)}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OptionsCard;
