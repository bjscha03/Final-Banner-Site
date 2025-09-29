import React, { useState, useEffect } from 'react';
import { X, ShoppingCart, CreditCard, Check } from 'lucide-react';
import { createPortal } from 'react-dom';
import { QuoteState } from '@/store/quote';
import { formatDimensions, usd } from '@/lib/pricing';

export interface UpsellOption {
  id: 'grommets' | 'rope' | 'polePockets';
  label: string;
  description: string;
  price: number;
  selected: boolean;
}

export interface UpsellModalProps {
  isOpen: boolean;
  onClose: () => void;
  quote: QuoteState;
  onContinue: (selectedOptions: UpsellOption[], dontAskAgain: boolean) => void;
  actionType: 'cart' | 'checkout';
}

const UpsellModal: React.FC<UpsellModalProps> = ({
  isOpen,
  onClose,
  quote,
  onContinue,
  actionType
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
    
    // Add grommets if none selected
    if (quote.grommets === 'none') {
      options.push({
        id: 'grommets',
        label: 'Grommets (Every 2-3 feet)',
        description: 'Metal reinforced holes for easy hanging',
        price: 0, // Grommets are free
        selected: false
      });
    }

    // Add rope if not selected
    if (!quote.addRope) {
      const ropeLinearFeet = quote.widthIn / 12;
      const ropeCost = ropeLinearFeet * 2 * quote.quantity; // $2 per linear foot
      options.push({
        id: 'rope',
        label: 'Nylon Rope',
        description: `${ropeLinearFeet.toFixed(1)} linear feet for secure mounting`,
        price: ropeCost,
        selected: false
      });
    }

    // Add pole pockets if none selected
    if (quote.polePockets === 'none') {
      const setupFee = 15;
      const pocketLinearFeet = (quote.widthIn / 12) * 2; // Top and bottom
      const pocketCost = setupFee + (pocketLinearFeet * 2); // $2 per linear foot + setup
      options.push({
        id: 'polePockets',
        label: 'Pole Pockets (Top & Bottom)',
        description: '2" sewn pockets for pole mounting',
        price: pocketCost,
        selected: false
      });
    }

    setSelectedOptions(options);
  }, [isOpen, quote]);

  // Handle option toggle
  const toggleOption = (optionId: string) => {
    setSelectedOptions(prev => 
      prev.map(option => 
        option.id === optionId 
          ? { ...option, selected: !option.selected }
          : option
      )
    );
  };

  // Handle continue with selected options
  const handleContinue = () => {
    onContinue(selectedOptions, dontAskAgain);
  };

  // Handle skip without options
  const handleSkip = () => {
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
  const actionIcon = actionType === 'cart' ? ShoppingCart : CreditCard;
  const actionText = actionType === 'cart' ? 'Add to Cart' : 'Buy Now';

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
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
          {/* Product Info */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                <span className="text-white font-bold">
                  {quote.widthIn}"×{quote.heightIn}"
                </span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 text-lg">
                  {formatDimensions(quote.widthIn, quote.heightIn)} Banner
                </h3>
                <p className="text-gray-600">
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
                className={`border-2 rounded-xl p-4 transition-all cursor-pointer ${
                  option.selected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => toggleOption(option.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`w-6 h-6 rounded border-2 flex items-center justify-center mt-0.5 ${
                      option.selected
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-gray-300'
                    }`}>
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
              className={`w-full py-4 px-6 rounded-xl font-bold text-white transition-all ${
                hasSelectedOptions
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'
                  : 'bg-gray-900 hover:bg-black'
              }`}
            >
              <div className="flex items-center justify-center gap-3">
                {React.createElement(actionIcon, { className: "h-5 w-5" })}
                <span>
                  {hasSelectedOptions 
                    ? `Add Selected & ${actionText} (+${usd(totalAdditionalCost)})`
                    : actionText
                  }
                </span>
              </div>
            </button>
            
            <button
              onClick={handleSkip}
              className="w-full py-3 px-4 border-2 border-gray-300 rounded-xl font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
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
