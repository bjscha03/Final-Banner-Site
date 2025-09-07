import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, X, ChevronDown } from 'lucide-react';

interface GrommetOption {
  id: string;
  label: string;
  description?: string;
}

interface GrommetPickerProps {
  value: string | null;
  onChange: (value: string) => void;
  options: GrommetOption[];
  className?: string;
  placeholder?: string;
}

/**
 * Responsive grommet picker component
 * Mobile (<640px): Full-screen bottom sheet
 * Desktop (≥640px): Portal-based dropdown
 */
export function GrommetPicker({
  value,
  onChange,
  options,
  className = '',
  placeholder = 'Select option'
}: GrommetPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selectedOption = options.find(option => option.id === value);

  // Detect mobile screen size
  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 639px)');
    setIsMobile(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Calculate dropdown position for desktop
  useEffect(() => {
    if (isOpen && !isMobile && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
        width: rect.width
      });
    }
  }, [isOpen, isMobile]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
        // For mobile, check if click is outside the sheet
        if (isMobile) {
          const sheet = document.querySelector('[data-grommet-sheet]');
          if (sheet && !sheet.contains(event.target as Node)) {
            setIsOpen(false);
          }
        } else {
          setIsOpen(false);
        }
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, isMobile]);

  const handleSelect = (optionId: string) => {
    onChange(optionId);
    setIsOpen(false);
  };

  const renderMobileSheet = () => (
    <div className="fixed inset-0 z-[9999] flex items-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setIsOpen(false)}
      />
      
      {/* Bottom Sheet */}
      <div 
        data-grommet-sheet
        className="relative w-full bg-white rounded-t-2xl shadow-2xl max-h-[80vh] flex flex-col animate-in slide-in-from-bottom duration-300"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Select Grommet Option</h3>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Options List */}
        <div className="flex-1 overflow-y-auto">
          {options.map((option) => (
            <button
              key={option.id}
              onClick={() => handleSelect(option.id)}
              className={`w-full text-left p-4 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0 ${
                value === option.id ? 'bg-blue-50 border-blue-100' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className={`font-medium ${value === option.id ? 'text-blue-700' : 'text-gray-900'}`}>
                    {option.label}
                  </div>
                  {option.description && (
                    <div className="text-sm text-gray-500 mt-1">{option.description}</div>
                  )}
                </div>
                {value === option.id && (
                  <Check className="h-5 w-5 text-blue-500 flex-shrink-0" />
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Cancel Button */}
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={() => setIsOpen(false)}
            className="w-full py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  const renderDesktopDropdown = () => (
    <div 
      className="fixed bg-white border border-gray-200 rounded-xl shadow-xl z-[9999] overflow-hidden max-h-[60vh] overflow-y-auto min-w-[300px]"
      style={{
        top: dropdownPosition.top,
        left: dropdownPosition.left,
        width: Math.max(dropdownPosition.width, 300)
      }}
    >
      {options.map((option) => (
        <button
          key={option.id}
          onClick={() => handleSelect(option.id)}
          className={`w-full text-left px-4 py-3.5 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0 touch-manipulation min-h-[44px] ${
            value === option.id ? 'bg-blue-50 border-blue-100' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className={`font-medium ${value === option.id ? 'text-blue-700' : 'text-gray-900'}`}>
                {option.label}
              </div>
              {option.description && (
                <div className="text-sm text-gray-500 mt-0.5">{option.description}</div>
              )}
            </div>
            {value === option.id && (
              <Check className="h-4 w-4 text-blue-500 flex-shrink-0" />
            )}
          </div>
        </button>
      ))}
    </div>
  );

  return (
    <div className={className}>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm transition-all duration-200 text-left touch-manipulation min-h-[44px]"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gray-500 rounded-full flex-shrink-0"></div>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-gray-900 truncate">
              {selectedOption?.label || placeholder}
            </div>
            {selectedOption?.description && (
              <div className="text-sm text-gray-500 truncate">{selectedOption.description}</div>
            )}
          </div>
        </div>
        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Render appropriate dropdown/sheet */}
      {isOpen && createPortal(
        isMobile ? renderMobileSheet() : renderDesktopDropdown(),
        document.body
      )}
    </div>
  );
}

export default GrommetPicker;
