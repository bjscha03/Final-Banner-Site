import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Circle, ChevronDown, Check } from 'lucide-react';
import { useQuoteStore, Grommets } from '@/store/quote';

interface GrommetOption {
  key: Grommets;
  name: string;
  description: string;
}

const grommetOptions: GrommetOption[] = [
  {
    key: 'none',
    name: 'None',
    description: 'No grommets'
  },
  {
    key: 'every-2-3ft',
    name: 'Every 2–3 feet',
    description: 'Standard spacing for most applications'
  },
  {
    key: 'every-1-2ft',
    name: 'Every 1–2 feet',
    description: 'Close spacing for high wind areas'
  },
  {
    key: '4-corners',
    name: '4 corners only',
    description: 'Corner grommets for simple hanging'
  },
  {
    key: 'top-corners',
    name: 'Top corners only',
    description: 'Top edge mounting'
  },
  {
    key: 'right-corners',
    name: 'Right corners only',
    description: 'Right edge mounting'
  },
  {
    key: 'left-corners',
    name: 'Left corners only',
    description: 'Left edge mounting'
  }
];

const GrommetsCard: React.FC = () => {
  const { grommets, set } = useQuoteStore();
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  const selectedOption = grommetOptions.find(option => option.key === grommets);

  const handleGrommetChange = (value: Grommets) => {
    set({ grommets: value });
    setIsOpen(false);
  };

  // Calculate dropdown position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
        width: rect.width
      });
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="bg-white border border-gray-200/60 rounded-2xl overflow-hidden shadow-sm">
      {/* Modern Header */}
      <div className="bg-gradient-to-r from-gray-50/50 to-white px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-gray-500 to-gray-700 rounded-xl flex items-center justify-center shadow-sm">
            <Circle className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 tracking-tight">Grommets</h2>
            <p className="text-sm text-gray-500">Choose grommet placement</p>
          </div>
        </div>
      </div>

      {/* Modern Dropdown */}
      <div className="p-6">
        <div className="relative">
          <button
            ref={buttonRef}
            onClick={() => setIsOpen(!isOpen)}
            className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm transition-all duration-200 text-left touch-manipulation min-h-[44px]"
          >
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
              <div>
                <div className="font-medium text-gray-900">{selectedOption?.name}</div>
                <div className="text-sm text-gray-500">{selectedOption?.description}</div>
              </div>
            </div>
            <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Portal-based dropdown to prevent clipping */}
          {isOpen && createPortal(
            <div
              className="fixed bg-white border border-gray-200 rounded-xl shadow-xl z-[1000] overflow-hidden max-h-[60vh] overflow-y-auto"
              style={{
                top: dropdownPosition.top,
                left: dropdownPosition.left,
                width: dropdownPosition.width
              }}
            >
              {grommetOptions.map((option) => (
                <button
                  key={option.key}
                  onClick={() => handleGrommetChange(option.key)}
                  className={`w-full text-left px-4 py-3.5 hover:bg-gray-50 transition-colors duration-150 border-b border-gray-100 last:border-b-0 touch-manipulation min-h-[44px] ${
                    grommets === option.key ? 'bg-blue-50 border-blue-100' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className={`font-medium ${grommets === option.key ? 'text-blue-700' : 'text-gray-900'}`}>
                        {option.name}
                      </div>
                      <div className="text-sm text-gray-500 mt-0.5">{option.description}</div>
                    </div>
                    {grommets === option.key && (
                      <Check className="w-4 h-4 text-blue-500" />
                    )}
                  </div>
                </button>
              ))}
            </div>,
            document.body
          )}
        </div>

        {/* Info Banner */}
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
      </div>
    </div>
  );
};

export default GrommetsCard;
