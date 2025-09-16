import React from 'react';
import { Minus } from 'lucide-react';
import { useQuoteStore } from '@/store/quote';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const polePocketOptions = [
  { value: 'none', label: 'None' },
  { value: 'top', label: 'Top only' },
  { value: 'bottom', label: 'Bottom only' },
  { value: 'top-bottom', label: 'Top & Bottom' },
  { value: 'left', label: 'Left only' },
  { value: 'right', label: 'Right only' }
];

const PolePocketsCard: React.FC = () => {
  const { polePockets, set } = useQuoteStore();

  const handlePolePocketsChange = (value: string) => {
    set({ polePockets: value });
  };

  return (
    <div className="bg-white rounded-2xl shadow-md p-5 md:p-6">
      <div className="flex items-center space-x-2 mb-6">
        <Minus className="h-5 w-5 text-indigo-500" />
        <h3 className="text-lg font-bold text-gray-900">📏 Pole Pockets</h3>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select pole pocket configuration
          </label>
          <Select value={polePockets} onValueChange={handlePolePocketsChange}>
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

        <div className="p-3 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-700">
            <strong>Note:</strong> Pole pockets create a sleeve for inserting poles or rods. 
            This option doesn't affect pricing but will be noted in your order specifications.
          </p>
        </div>

        {polePockets !== 'none' && (
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
