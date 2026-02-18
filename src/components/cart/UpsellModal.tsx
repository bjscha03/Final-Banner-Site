import React, { useState, useEffect } from 'react';
import { X, ShoppingCart, CreditCard, Check, ChevronDown, Eye, Loader2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { QuoteState, Grommets, PolePocketSize } from '@/store/quote';
import { formatDimensions, usd, ropeCost, polePocketCost } from '@/lib/pricing';
import BannerPreview from './BannerPreview';

export interface UpsellOption {
  id: 'grommets' | 'rope' | 'polePockets';
  label: string;
  description: string;
  price: number;
  selected: boolean;
  // For detailed options
  grommetSelection?: string;
  polePocketSelection?: string;
  polePocketSize?: string;
}

// Grommet options matching GrommetsCard
const grommetOptions = [
  { id: 'every-2-3ft', label: 'Every 2–3 feet', description: 'Standard spacing for most applications' },
  { id: 'every-1-2ft', label: 'Every 1–2 feet', description: 'Close spacing for high wind areas' },
  { id: '4-corners', label: '4 corners only', description: 'Corner grommets for simple hanging' },
  { id: 'top-corners', label: 'Top corners only', description: 'Top edge mounting' },
  { id: 'right-corners', label: 'Right corners only', description: 'Right edge mounting' },
  { id: 'left-corners', label: 'Left corners only', description: 'Left edge mounting' }
];

// Pole pocket options matching PolePocketsCard
const polePocketOptions = [
  { value: 'top', label: 'Top only' },
  { value: 'bottom', label: 'Bottom only' },
  { value: 'top-bottom', label: 'Top & Bottom' },
  { value: 'left', label: 'Left only' },
  { value: 'right', label: 'Right only' }
];

// Pole pocket size options
const polePocketSizeOptions = [
  { value: '1', label: '1 inch' },
  { value: '2', label: '2 inch' },
  { value: '3', label: '3 inch' },
  { value: '4', label: '4 inch' }
];

export interface UpsellModalProps {
  isOpen: boolean;
  onClose: () => void;
  quote: QuoteState;
  thumbnailUrl?: string; // Canvas thumbnail for preview
  onContinue: (selectedOptions: UpsellOption[], dontAskAgain: boolean) => void;
  actionType: 'cart' | 'checkout' | 'update';
  designServiceEnabled?: boolean; // For design service orders to show placeholder thumbnail
  isProcessing?: boolean; // Show loading state on buttons during async operations
}

const UpsellModal: React.FC<UpsellModalProps> = ({
  isOpen,
  onClose,
  quote,
  thumbnailUrl,
  onContinue,
  actionType,
  designServiceEnabled = false,
  isProcessing = false,
}) => {
  const [selectedOptions, setSelectedOptions] = useState<UpsellOption[]>([]);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Check if mobile on mount and window resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Initialize available upsell options based on current quote
  useEffect(() => {
    if (!isOpen) return;

    const options: UpsellOption[] = [];
    
    // MUTUAL EXCLUSIVITY: Only show grommets if pole pockets are not selected
    // Add grommets if none selected AND pole pockets are not selected
    if (quote.grommets === 'none' && quote.polePockets === 'none') {
      options.push({
        id: 'grommets',
        label: 'Grommets',
        description: 'Metal reinforced holes for easy hanging',
        price: 0, // Grommets are free
        selected: false,
        grommetSelection: 'every-2-3ft' // Default selection
      });
    }

    // Add rope if not selected
    if (!quote.addRope) {
      const ropeCostValue = ropeCost(quote.widthIn, quote.quantity);
      options.push({
        id: 'rope',
        label: 'Nylon Rope',
        description: `${(quote.widthIn / 12).toFixed(1)} linear feet for secure mounting`,
        price: ropeCostValue,
        selected: false
      });
    }

    // MUTUAL EXCLUSIVITY: Only show pole pockets if grommets are not selected
    // Add pole pockets if none selected AND grommets are not selected
    if (quote.polePockets === 'none' && quote.grommets === 'none') {
      const defaultPolePocketSelection = 'top-bottom';
      const pocketCost = polePocketCost(quote.widthIn, quote.heightIn, defaultPolePocketSelection, quote.quantity);
      options.push({
        id: 'polePockets',
        label: 'Pole Pockets',
        description: 'Sewn pockets for pole mounting',
        price: pocketCost,
        selected: false,
        polePocketSelection: defaultPolePocketSelection,
        polePocketSize: '2' // Default to 2"
      });
    }

    setSelectedOptions(options);
  }, [isOpen, quote]);

  // Handle option toggle with mutual exclusivity
  const toggleOption = (optionId: string) => {
    setSelectedOptions(prev => 
      prev.map(option => {
        if (option.id === optionId) {
          // Toggle the clicked option
          return { ...option, selected: !option.selected };
        }
        
        // MUTUAL EXCLUSIVITY: If selecting grommets, deselect pole pockets (and vice versa)
        if (optionId === 'grommets' && option.id === 'polePockets') {
          return { ...option, selected: false };
        }
        if (optionId === 'polePockets' && option.id === 'grommets') {
          return { ...option, selected: false };
        }
        
        return option;
      })
    );
  };

  // Handle grommet selection change
  const handleGrommetChange = (optionId: string, grommetId: string) => {
    setSelectedOptions(prev => 
      prev.map(option => 
        option.id === optionId 
          ? { ...option, grommetSelection: grommetId }
          : option
      )
    );
  };

  // Handle pole pocket selection change
  const handlePolePocketChange = (optionId: string, polePocketValue: string) => {
    setSelectedOptions(prev => 
      prev.map(option => {
        if (option.id === optionId) {
          const newPrice = polePocketCost(quote.widthIn, quote.heightIn, polePocketValue, quote.quantity);
          return { 
            ...option, 
            polePocketSelection: polePocketValue,
            price: newPrice
          };
        }
        return option;
      })
    );
  };

  // Handle pole pocket size change
  const handlePolePocketSizeChange = (optionId: string, size: string) => {
    setSelectedOptions(prev => 
      prev.map(option => 
        option.id === optionId 
          ? { ...option, polePocketSize: size }
          : option
      )
    );
  };

  // Handle continue with selected options
  const handleContinue = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent click from bubbling to backdrop
    if (isProcessing) return; // Prevent double-clicks during processing
    onContinue(selectedOptions, dontAskAgain);
  };

  // Handle skip without options
  const handleSkip = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent click from bubbling to backdrop
    if (isProcessing) return; // Prevent double-clicks during processing
    onContinue([], dontAskAgain);
  };

  // Calculate total additional cost
  const totalAdditionalCost = selectedOptions
    .filter(option => option.selected)
    .reduce((sum, option) => sum + option.price, 0);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const hasSelectedOptions = selectedOptions.some(option => option.selected);
  
  // Determine icon and text based on action type
  let actionIcon = ShoppingCart;
  let actionText = 'Add to Cart';
  
  if (actionType === 'checkout') {
    actionIcon = CreditCard;
    actionText = 'Buy Now';
  } else if (actionType === 'update') {
    actionIcon = ShoppingCart;
    actionText = 'Update Cart Item';
  }

  // Custom dropdown component for options
  const OptionDropdown: React.FC<{
    value: string;
    options: Array<{id?: string; value?: string; label: string; description?: string}>;
    onChange: (value: string) => void;
    placeholder: string;
  }> = ({ value, options, onChange, placeholder }) => {
    const [isOpen, setIsOpen] = useState(false);
    const selectedOption = options.find(opt => (opt.id || opt.value) === value);

    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full px-3 py-2 text-left bg-white border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 flex items-center justify-between"
        >
          <span className="text-sm">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        
        {isOpen && (
          <div className="absolute z-[10000] w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
            {options.map((option) => (
              <button
                key={option.id || option.value}
                type="button"
                onClick={() => {
                  onChange(option.id || option.value || '');
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2 text-left hover:bg-gray-50 focus:outline-none focus:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
              >
                <div className="text-sm font-medium text-gray-900">{option.label}</div>
                {option.description && (
                  <div className="text-xs text-gray-500 mt-1">{option.description}</div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return createPortal(
    <div data-upsell-modal className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            Complete Your Banner
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Thumbnail preview notice */}
          <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700">
            <Eye className="h-4 w-4 flex-shrink-0 mt-0.5 text-blue-500" />
            <p>
              <span className="font-medium">Preview only.</span> Our team personally reviews every banner before production and will reach out if anything needs attention.
            </p>
          </div>

          {/* Product Info with Live Preview */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center gap-4">
              {/* Live Banner Preview */}
              <BannerPreview
                widthIn={quote.widthIn}
                heightIn={quote.heightIn}
                grommets={selectedOptions.find(opt => opt.id === 'grommets' && opt.selected)?.grommetSelection as Grommets || quote.grommets}
                imageUrl={thumbnailUrl || quote.file?.url}
                material={quote.material}
                textElements={quote.textElements}
                overlayImage={quote.overlayImage}
                className="flex-shrink-0"
                imageScale={quote.imageScale}
                imagePosition={quote.imagePosition}
                designServiceEnabled={designServiceEnabled}
              />
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 text-lg">
                  {formatDimensions(quote.widthIn, quote.heightIn)} Banner
                </h3>
                <p className="text-gray-600 text-sm">
                  {quote.quantity} {quote.quantity === 1 ? 'banner' : 'banners'} • {quote.material} vinyl
                </p>
              </div>
            </div>
          </div>

          {/* Question */}
          <div className="text-center">
            <p className="text-gray-700 font-medium text-lg">
              Do you want to add any of these options before finishing?
            </p>
          </div>

          {/* Options */}
          <div className="space-y-4">
            {selectedOptions.map((option) => (
              <div
                key={option.id}
                className={`border-2 rounded-xl p-4 transition-all ${
                  option.selected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3">
                    <div 
                      className={`w-6 h-6 rounded border-2 flex items-center justify-center mt-0.5 cursor-pointer ${
                        option.selected
                          ? 'border-blue-500 bg-blue-500'
                          : 'border-gray-300'
                      }`}
                      onClick={() => toggleOption(option.id)}
                    >
                      {option.selected && <Check className="h-4 w-4 text-white" />}
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">{option.label}</h4>
                      <p className="text-sm text-gray-600 mt-1">{option.description}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-gray-900">
                      {option.price === 0 ? 'FREE' : usd(option.price)}
                    </span>
                  </div>
                </div>

                {/* Detailed options for grommets */}
                {option.id === 'grommets' && option.selected && (
                  <div className="mt-3 pl-9">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Grommet Placement
                    </label>
                    <OptionDropdown
                      value={option.grommetSelection || 'every-2-3ft'}
                      options={grommetOptions}
                      onChange={(value) => handleGrommetChange(option.id, value)}
                      placeholder="Select grommet placement"
                    />
                  </div>
                )}

                {/* Detailed options for pole pockets */}
                {option.id === 'polePockets' && option.selected && (
                  <div className="mt-3 pl-9 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Pole Pocket Configuration
                      </label>
                      <OptionDropdown
                        value={option.polePocketSelection || 'top-bottom'}
                        options={polePocketOptions}
                        onChange={(value) => handlePolePocketChange(option.id, value)}
                        placeholder="Select pole pocket configuration"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Pole Pocket Size
                      </label>
                      <OptionDropdown
                        value={option.polePocketSize || '2'}
                        options={polePocketSizeOptions}
                        onChange={(value) => handlePolePocketSizeChange(option.id, value)}
                        placeholder="Select pocket size"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-6 space-y-4">
          {/* Don't ask again */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="dont-ask-desktop"
              checked={dontAskAgain}
              onChange={(e) => setDontAskAgain(e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="dont-ask-desktop" className="text-sm text-gray-600">
              Don't ask again
            </label>
          </div>

          {/* Action buttons */}
          <div className="space-y-3">
            <button
              onClick={handleContinue}
              disabled={isProcessing}
              className={`w-full py-4 px-6 rounded-xl font-bold text-white transition-all ${
                isProcessing
                  ? 'bg-gray-400 cursor-not-allowed'
                  : hasSelectedOptions
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'
                    : 'bg-gray-900 hover:bg-black'
              }`}
            >
              <div className="flex items-center justify-center gap-3">
                {isProcessing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    {React.createElement(actionIcon, { className: "h-5 w-5" })}
                    <span>
                      {hasSelectedOptions 
                        ? `Add Selected & ${actionText} (+${usd(totalAdditionalCost)})`
                        : actionText
                      }
                    </span>
                  </>
                )}
              </div>
            </button>
            
            <button
              onClick={handleSkip}
              disabled={isProcessing}
              className={`w-full py-3 px-4 border-2 border-gray-300 rounded-xl font-semibold transition-colors ${
                isProcessing
                  ? 'text-gray-400 cursor-not-allowed'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              No thanks, continue without
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default UpsellModal;
