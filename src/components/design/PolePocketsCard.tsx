import React from 'react';
import { Minus, AlertCircle } from 'lucide-react';
import { useQuoteStore } from '@/store/quote';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const polePocketOptions = [
  { value: 'none', label: 'None' },
  { value: 'top', label: 'Top only' },
  { value: 'bottom', label: 'Bottom only' },
  { value: 'top-bottom', label: 'Top & Bottom' },
  { value: 'left', label: 'Left only' },
  { value: 'right', label: 'Right only' }
];

const PolePocketsCard: React.FC = () => {
  const { polePockets, grommets, set } = useQuoteStore();
  
  // Check if grommets are selected (mutual exclusivity)
  const isDisabled = grommets !== 'none';

  const handlePolePocketsChange = (value: string) => {
    if (!isDisabled) {
      set({ polePockets: value });
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-md p-5 md:p-6">
      <div className="flex items-center space-x-2 mb-6">
        <Minus className="h-5 w-5 text-indigo-500" />
        <h3 className="text-lg font-bold text-gray-900">📏 Pole Pockets</h3>
      </div>

      <div className="space-y-4">
        {/* Warning banner when disabled */}
        {isDisabled && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              <p className="text-sm font-medium text-amber-800">
                Pole pockets cannot be selected when grommets are active. 
                Set grommets to "None" to enable pole pockets.
              </p>
            </div>
          </div>
        )}
        
        <div className={isDisabled ? 'opacity-50 pointer-events-none' : ''}>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select pole pocket configuration
          </label>
          <Select value={polePockets} onValueChange={handlePolePocketsChange} disabled={isDisabled}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose pole pocket option" />
            </SelectTrigger>
            <SelectContent>
              {polePocketOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!isDisabled && (
          <div className="p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700">
              <strong>Note:</strong> Pole pockets create a sleeve for inserting poles or rods. 
              This option doesn't affect pricing but will be noted in your order specifications.
            </p>
          </div>
        )}

        {polePockets !== 'none' && !isDisabled && (
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">
              <strong>Selected:</strong> {polePocketOptions.find(opt => opt.value === polePockets)?.label}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PolePocketsCard;
