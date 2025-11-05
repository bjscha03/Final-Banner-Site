import React from 'react';
import { Circle, Check, AlertCircle } from 'lucide-react';
import { useQuoteStore, Grommets } from '@/store/quote';
import { GrommetPicker } from '@/components/ui/GrommetPicker';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const grommetOptions = [
  {
    id: 'none',
    label: 'None',
    description: 'No grommets'
  },
  {
    id: 'every-2-3ft',
    label: 'Every 2–3 feet',
    description: 'Standard spacing for most applications'
  },
  {
    id: 'every-1-2ft',
    label: 'Every 1–2 feet',
    description: 'Close spacing for high wind areas'
  },
  {
    id: '4-corners',
    label: '4 corners only',
    description: 'Corner grommets for simple hanging'
  },
  {
    id: 'top-corners',
    label: 'Top corners only',
    description: 'Top edge mounting'
  },
  {
    id: 'right-corners',
    label: 'Right corners only',
    description: 'Right edge mounting'
  },
  {
    id: 'left-corners',
    label: 'Left corners only',
    description: 'Left edge mounting'
  }
];

const GrommetsCard: React.FC = () => {
  const { grommets, polePockets, set } = useQuoteStore();
  
  // Check if pole pockets are selected (mutual exclusivity)
  const isDisabled = polePockets !== 'none';

  const handleGrommetChange = (value: string) => {
    console.log('🔧 [GROMMET CARD] handleGrommetChange called with:', value);
    console.log('🔧 [GROMMET CARD] Current grommets state:', grommets);
    // Always call set() - the store handles mutual exclusivity
    set({ grommets: value as Grommets });
    console.log('🔧 [GROMMET CARD] set() called, new value should be:', value);
  };

  return (
    <div className="bg-white border border-gray-200/60 rounded-lg overflow-hidden shadow-sm">
      {/* Modern Header */}
      <div className="bg-white px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center shadow-sm">
            <Circle className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 tracking-tight">Grommets</h2>
            <p className="text-sm text-gray-500">Choose grommet placement</p>
          </div>
        </div>
      </div>

      {/* Responsive Grommet Picker */}
      <div className="p-6">
        {/* Warning banner when disabled */}
        {isDisabled && (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              <p className="text-sm font-medium text-amber-800">
                Grommets cannot be selected when pole pockets are active. 
                Set pole pockets to "None" to enable grommets.
              </p>
            </div>
          </div>
        )}
        
        <div className={isDisabled ? 'opacity-60' : ''}>
          <GrommetPicker
            value={grommets}
            onChange={handleGrommetChange}
            options={grommetOptions}
            placeholder="Choose grommet placement"
          />
        </div>

        {/* Info Banner */}
        {!isDisabled && (
          <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                <Check className="w-3 h-3 text-white" />
              </div>
              <p className="text-sm font-medium text-emerald-700">
                All grommet options included at no extra cost
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GrommetsCard;
