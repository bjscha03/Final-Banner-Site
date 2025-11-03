import React, { useState } from 'react';
import { Circle, Minus, ChevronDown, Info, HelpCircle } from 'lucide-react';
import { useQuoteStore, PolePocketSize, Grommets } from '@/store/quote';
import { ropeCost, polePocketCost } from '@/lib/pricing';
import { Checkbox } from '@/components/ui/checkbox';
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

  return (
    <div className="bg-white border border-gray-200/60 rounded-lg overflow-hidden shadow-sm">
      {/* Header */}
      <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center shadow-sm">
              <Circle className="w-5 h-5 text-white" />
            </div>
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full shadow-sm animate-pulse"></div>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 tracking-tight">Options</h2>
            <p className="text-sm text-gray-500">Pole pockets and rope</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">


        {/* Pole Pockets Section */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Minus className="w-4 h-4 text-gray-600" />
            <h3 className="text-sm font-medium text-gray-700">Pole Pockets</h3>
            <button
              onMouseEnter={() => setShowPolePocketInfo(true)}
              onMouseLeave={() => setShowPolePocketInfo(false)}
              className="relative"
            >
              <HelpCircle className="w-3 h-3 text-gray-400 hover:text-gray-600" />
              {showPolePocketInfo && (
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-sm z-10">
                  <div className="mb-2 font-medium">Pole Pockets</div>
                  <div>Create a sleeve for inserting poles or rods. Perfect for hanging banners from poles or creating a professional display setup.</div>
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                </div>
              )}
            </button>
          </div>

          <div className="space-y-3">
            {/* Checkbox to enable/disable pole pockets */}
            <div className="flex items-center space-x-3">
              <Checkbox
                id="enable-pole-pockets"
                checked={polePockets !== 'none'}
                onCheckedChange={(checked) => {
                  if (checked) {
                    set({ polePockets: 'top' }); // Default to 'top' when enabling
                  } else {
                    set({ polePockets: 'none' });
                  }
                }}
              />
              <label htmlFor="enable-pole-pockets" className="text-sm text-gray-700 cursor-pointer flex-1">
                Add Pole Pockets
                {totalPolePocketCost > 0 && (
                  <span className="ml-2 text-green-600 font-medium">
                    (+${totalPolePocketCost.toFixed(2)})
                  </span>
                )}
              </label>
            </div>

            {/* Dropdown for pole pocket configuration - only show when enabled */}
            {polePockets !== 'none' && (
              <Select value={polePockets} onValueChange={(value) => {
                  console.log('[OptionsCard] Pole pocket selection changed to:', value);
                  set({ polePockets: value });
                }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose pole pocket option" />
                </SelectTrigger>
                <SelectContent>
                  {polePocketOptions.filter(option => option.value !== 'none').map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Additional options when pole pockets are enabled */}
            {polePockets !== 'none' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Pocket Size
                  </label>
                  <Select value={polePocketSize} onValueChange={(value) => set({ polePocketSize: value as PolePocketSize })}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select pocket size" />
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
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <div className="text-xs font-medium text-blue-800 mb-1">Cost Breakdown:</div>
                    <div className="text-xs text-blue-700">
                      Setup fee: $15.00
                    </div>
                    <div className="text-xs text-blue-700">
                      Linear feet: {(() => {
                        let linearFeet = 0;
                        switch (polePockets) {
                          case 'top':
                          case 'bottom':
                            linearFeet = widthIn / 12;
                            break;
                          case 'left':
                          case 'right':
                            linearFeet = heightIn / 12;
                            break;
                          case 'top-bottom':
                            linearFeet = (widthIn / 12) * 2;
                            break;
                        }
                        return linearFeet.toFixed(1);
                      })()} ft × $2.00 = ${(() => {
                        let linearFeet = 0;
                        switch (polePockets) {
                          case 'top':
                          case 'bottom':
                            linearFeet = widthIn / 12;
                            break;
                          case 'left':
                          case 'right':
                            linearFeet = heightIn / 12;
                            break;
                          case 'top-bottom':
                            linearFeet = (widthIn / 12) * 2;
                            break;
                        }
                        return (linearFeet * 2.00 * quantity).toFixed(2);
                      })()}
                    </div>
                    <div className="text-xs font-semibold text-blue-800 mt-1 pt-1 border-t border-blue-200">
                      Total: ${totalPolePocketCost.toFixed(2)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>


        {/* Grommets Section */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Circle className="w-4 h-4 text-gray-600" />
            <h3 className="text-sm font-medium text-gray-700">Grommets</h3>
            <button
              onMouseEnter={() => setShowPolePocketInfo(true)}
              onMouseLeave={() => setShowPolePocketInfo(false)}
              className="relative"
            >
              <HelpCircle className="w-3 h-3 text-gray-400 hover:text-gray-600" />
            </button>
          </div>

          <div className="space-y-3">
            {/* Checkbox to enable/disable grommets */}
            <div className="flex items-center space-x-3">
              <Checkbox
                id="enable-grommets"
                checked={grommets !== 'none'}
                onCheckedChange={(checked) => {
                  console.log('[OptionsCard] Grommets checkbox changed:', checked);
                  if (checked) {
                    set({ grommets: '4-corners' as Grommets }); // Default to 4 corners
                  } else {
                    set({ grommets: 'none' as Grommets });
                  }
                }}
              />
              <label htmlFor="enable-grommets" className="text-sm text-gray-700 cursor-pointer flex-1">
                Add Grommets (Free)
              </label>
            </div>

            {/* Dropdown for grommet configuration - only show when enabled */}
            {grommets !== 'none' && (
              <Select value={grommets} onValueChange={(value) => {
                  console.log('[OptionsCard] Grommet selection changed to:', value);
                  set({ grommets: value as Grommets });
                }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose grommet placement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="4-corners">4 Corners</SelectItem>
                  <SelectItem value="top-corners">Top Corners Only</SelectItem>
                  <SelectItem value="every-2-3ft">Every 2-3 feet</SelectItem>
                  <SelectItem value="every-1-2ft">Every 1-2 feet</SelectItem>
                </SelectContent>
              </Select>
            )}

            {grommets !== 'none' && (
              <div className="bg-green-50 p-3 rounded-lg">
                <div className="text-xs font-medium text-green-800">
                  ✓ Grommets included at no extra charge
                </div>
                <div className="text-xs text-green-700 mt-1">
                  {grommets === '4-corners' && 'Grommets at all 4 corners'}
                  {grommets === 'top-corners' && 'Grommets at top 2 corners'}
                  {grommets === 'every-2-3ft' && 'Grommets every 2-3 feet around perimeter'}
                  {grommets === 'every-1-2ft' && 'Grommets every 1-2 feet around perimeter'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Rope Section */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm">🪢</span>
            <h3 className="text-sm font-medium text-gray-700">Rope</h3>
            <button
              onMouseEnter={() => setShowRopeInfo(true)}
              onMouseLeave={() => setShowRopeInfo(false)}
              className="relative"
            >
              <HelpCircle className="w-3 h-3 text-gray-400 hover:text-gray-600" />
              {showRopeInfo && (
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-sm z-10">
                  <div className="mb-2 font-medium">Rope Details</div>
                  <div className="space-y-1">
                    <div>• $2 per linear foot of width</div>
                    <div>• Banner width: {widthIn}"</div>
                    <div>• Linear feet per banner: {linearFeet.toFixed(1)}</div>
                    <div>• Quantity: {quantity}</div>
                    {addRope && <div className="font-medium">Total: ${totalRopeCost.toFixed(2)}</div>}
                  </div>
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                </div>
              )}
            </button>
          </div>
          
          <div className="flex items-center space-x-3">
            <Checkbox
              id="add-rope"
              checked={addRope}
              onCheckedChange={(checked) => set({ addRope: checked as boolean })}
            />
            <label htmlFor="add-rope" className="text-sm text-gray-700 cursor-pointer flex-1">
              Add Rope — $2 per linear foot
              {addRope && (
                <span className="ml-2 text-green-600 font-medium">
                  (+${totalRopeCost.toFixed(2)})
                </span>
              )}
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OptionsCard;
