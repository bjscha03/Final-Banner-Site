import React, { useState, useEffect, useRef } from 'react';
import { X, ShoppingCart, CreditCard, Check, ChevronDown, Eye, Loader2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { QuoteState, Grommets, PolePocketSize } from '@/store/quote';
import { formatDimensions, usd, ropeCost, polePocketCost } from '@/lib/pricing';
import BannerPreview from './BannerPreview';
import ThumbnailPreviewWrapper from '@/components/preview/ThumbnailPreviewWrapper';
import { getProductCopy } from '@/lib/product-copy';
import { useDocumentScrollLock } from '@/hooks/useDocumentScrollLock';

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
  thumbnailIsExactComposition?: boolean;
  thumbnailCompositionSignature?: string;
  onContinue: (selectedOptions: UpsellOption[], dontAskAgain: boolean) => void;
  actionType: 'cart' | 'checkout' | 'update';
  designServiceEnabled?: boolean; // For design service orders to show placeholder thumbnail
  isProcessing?: boolean; // Show loading state on buttons during async operations
  productType?: string; // Product type for product-aware copy
}

const UpsellModal: React.FC<UpsellModalProps> = ({
  isOpen,
  onClose,
  quote,
  thumbnailUrl,
  thumbnailIsExactComposition = false,
  thumbnailCompositionSignature,
  onContinue,
  actionType,
  designServiceEnabled = false,
  isProcessing = false,
  productType,
}) => {
  const copy = getProductCopy(productType);
  const [selectedOptions, setSelectedOptions] = useState<UpsellOption[]>([]);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const isBannerProduct = !productType || productType === 'banner';

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useDocumentScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )).filter((element) => !element.hasAttribute('hidden'));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
    };
  }, [isOpen]);

  // Initialize available upsell options based on current quote
  useEffect(() => {
    if (!isOpen) return;

    if (!isBannerProduct) {
      setSelectedOptions([]);
      return;
    }

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
        description: 'Heat-welded pockets for pole mounting',
        price: pocketCost,
        selected: false,
        polePocketSelection: defaultPolePocketSelection,
        polePocketSize: '2' // Default to 2"
      });
    }

    setSelectedOptions(options);
    // Only re-initialize when the modal opens or when the underlying quote
    // fields that determine which options are *available* actually change.
    // Depending on the entire `quote` object would reset user selections on
    // every parent re-render (e.g. window resize), causing toggles like the
    // grommet checkbox to silently un-check themselves. See issue: grommets
    // disappear / get unselected when dragging the browser window.
  }, [
    isOpen,
    quote.grommets,
    quote.polePockets,
    quote.addRope,
    quote.widthIn,
    quote.heightIn,
    quote.quantity,
    isBannerProduct,
  ]);

  // Handle option toggle with single-selection enforcement (radio-like).
  // Only ONE finishing option (Grommets, Pole Pockets, or Rope) may be
  // selected at a time. Clicking the already-selected option deselects it,
  // returning to "no finishing option".
  const toggleOption = (optionId: string) => {
    setSelectedOptions(prev =>
      prev.map(option => {
        if (option.id === optionId) {
          // Toggle the clicked option
          return { ...option, selected: !option.selected };
        }
        // Any other option must be deselected when something is picked.
        return { ...option, selected: false };
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
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          className="flex min-h-11 w-full items-center justify-between border border-slate-300 bg-white px-3 py-2 text-left shadow-sm focus:outline-none focus:ring-2 focus:ring-[#FF6A00]"
        >
          <span className="text-sm">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        
        {isOpen && (
          <div role="listbox" aria-label={placeholder} className="relative z-[10000] mt-1 max-h-60 w-full overflow-auto border border-slate-300 bg-white shadow-lg sm:absolute">
            {options.map((option) => (
              <button
                key={option.id || option.value}
                type="button"
                role="option"
                aria-selected={(option.id || option.value) === value}
                onClick={() => {
                  onChange(option.id || option.value || '');
                  setIsOpen(false);
                }}
                className="min-h-11 w-full px-3 py-2 text-left hover:bg-[#FFF7F1] focus:outline-none focus:bg-[#FFF7F1]"
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
    <div data-upsell-modal className="fixed inset-0 z-[9999] flex items-end justify-center overflow-hidden overscroll-none p-0 sm:items-center sm:p-4">
      <div 
        className="absolute inset-0 touch-none bg-[#061120]/70"
        onClick={onClose}
        aria-hidden="true"
      />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upsell-modal-title"
        className="relative flex h-[94dvh] max-h-[780px] min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-t-xl bg-white shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-lg"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 p-4 sm:p-6">
          <h2 id="upsell-modal-title" className="font-display text-xl font-bold text-[#0B1F3A]">
            {copy.upsellHeader}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="flex min-h-11 min-w-11 items-center justify-center text-slate-500 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]"
            aria-label="Close options"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div
          data-upsell-scroll-region
          className="min-h-0 flex-1 touch-pan-y space-y-5 overflow-x-hidden overflow-y-auto overscroll-contain p-4 sm:space-y-6 sm:p-6"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {/* Thumbnail preview notice */}
          <div className="flex items-start gap-2 border-l-4 border-[#FF6A00] bg-[#FFF7F1] px-3 py-2 text-xs text-[#7A3212]">
            <Eye className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#A63C00]" />
            <p>
              <span className="font-medium">Preview only.</span> {copy.reviewNoticeBody}
            </p>
          </div>

          {/* Product Info with Live Preview */}
          <div className="border border-slate-200 bg-[#F7F7F7] p-4">
            <div className="flex min-w-0 flex-col items-center gap-4 sm:flex-row sm:items-center">
              {/* Live Banner Preview */}
              {(() => {
                const effectiveGrommets =
                  (selectedOptions.find(opt => opt.id === 'grommets' && opt.selected)?.grommetSelection as Grommets) ||
                  quote.grommets;
                return (
              <ThumbnailPreviewWrapper
                className="mx-auto max-w-full flex-shrink-0 sm:mx-0"
                title={`${formatDimensions(quote.widthIn, quote.heightIn)} ${copy.singularLabel}`}
                widthIn={quote.widthIn}
                heightIn={quote.heightIn}
                details={[
                  { label: 'Size', value: formatDimensions(quote.widthIn, quote.heightIn) },
                  { label: 'Material', value: `${quote.material} vinyl` },
                  { label: 'Quantity', value: String(quote.quantity) },
                  ...(effectiveGrommets !== 'none'
                    ? [{ label: 'Grommets', value: String(effectiveGrommets) }]
                    : []),
                ]}
                largePreview={
                  <BannerPreview
                    widthIn={quote.widthIn}
                    heightIn={quote.heightIn}
                    grommets={effectiveGrommets}
                    imageUrl={thumbnailUrl || quote.file?.url}
                    material={quote.material}
                    textElements={quote.textElements}
                    overlayImage={quote.overlayImage}
                    className="flex-shrink-0"
                    imageScale={quote.imageScale}
                    imageScaleY={quote.imageScaleY}
                    imagePosition={quote.imagePosition}
                    fitMode={quote.fitMode || "fill"}
                    designServiceEnabled={designServiceEnabled}
                    isFinalizedSnapshot={thumbnailIsExactComposition}
                    compositionSignature={thumbnailCompositionSignature}
                    maxSize={820}
                  />
                }
              >
                <BannerPreview
                  widthIn={quote.widthIn}
                  heightIn={quote.heightIn}
                  grommets={effectiveGrommets}
                  imageUrl={thumbnailUrl || quote.file?.url}
                  material={quote.material}
                  textElements={quote.textElements}
                  overlayImage={quote.overlayImage}
                  className="flex-shrink-0"
                  imageScale={quote.imageScale}
                  imageScaleY={quote.imageScaleY}
                  imagePosition={quote.imagePosition}
                  fitMode={quote.fitMode || "fill"}
                  designServiceEnabled={designServiceEnabled}
                  isFinalizedSnapshot={thumbnailIsExactComposition}
                  compositionSignature={thumbnailCompositionSignature}
                  maxSize={120}
                />
              </ThumbnailPreviewWrapper>
                );
              })()}
              <div className="flex-1 min-w-0">
                <h3 className="break-words text-center font-display text-lg font-bold text-[#0B1F3A] sm:text-left">
                  {formatDimensions(quote.widthIn, quote.heightIn)} {copy.singularLabel}
                </h3>
                <p className="mt-1 break-words text-center text-sm text-slate-600 sm:text-left">
                  {quote.quantity} {quote.quantity === 1 ? copy.singularLabel.toLowerCase() : copy.pluralLabel.toLowerCase()} • {quote.material} vinyl
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
                className={`border-2 p-4 transition-all ${
                  option.selected
                    ? 'border-[#FF6A00] bg-[#FFF7F1]'
                    : 'border-slate-200'
                }`}
              >
                <div className="mb-3 flex min-w-0 items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={option.selected}
                      aria-label={`${option.selected ? 'Remove' : 'Add'} ${option.label}`}
                      className={`flex min-h-11 min-w-11 flex-none items-center justify-center border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00] focus-visible:ring-offset-2 ${
                        option.selected
                          ? 'border-[#0B1F3A] bg-[#0B1F3A]'
                          : 'border-slate-300 bg-white'
                      }`}
                      onClick={() => toggleOption(option.id)}
                    >
                      {option.selected && <Check className="h-4 w-4 text-white" />}
                    </button>
                    <div className="min-w-0">
                      <h4 className="font-display font-bold text-[#0B1F3A]">{option.label}</h4>
                      <p className="mt-1 text-sm leading-5 text-slate-600">{option.description}</p>
                    </div>
                  </div>
                  <div className="flex-none text-right">
                    <span className="font-bold text-[#0B1F3A]">
                      {option.price === 0 ? 'FREE' : usd(option.price)}
                    </span>
                  </div>
                </div>

                {/* Detailed options for grommets */}
                {option.id === 'grommets' && option.selected && (
                  <div className="mt-3 sm:pl-14">
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
                  <div className="mt-3 space-y-3 sm:pl-14">
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
        <div className="shrink-0 space-y-3 border-t border-slate-200 bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 sm:space-y-4 sm:p-6">
          {/* Don't ask again */}
          <label htmlFor="dont-ask-upsell" className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-slate-600">
            <input
              type="checkbox"
              id="dont-ask-upsell"
              checked={dontAskAgain}
              onChange={(e) => setDontAskAgain(e.target.checked)}
              className="h-5 w-5 border-slate-300 accent-[#FF6A00]"
            />
            <span>Don't ask again</span>
          </label>

          {/* Action buttons */}
          <div className="space-y-3">
            <button
              onClick={handleContinue}
              disabled={isProcessing}
              className={`min-h-12 w-full px-5 py-3 font-bold transition-colors ${
                isProcessing
                  ? 'cursor-not-allowed bg-gray-400 text-[#0B1F3A]'
                  : hasSelectedOptions
                    ? 'bg-[#C94E00] text-white hover:bg-[#B84300]'
                    : 'bg-[#0B1F3A] text-white hover:bg-[#102A4C]'
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
            
            {!hasSelectedOptions && (
              <button
                onClick={handleSkip}
                disabled={isProcessing}
                className={`min-h-11 w-full border-2 border-slate-300 px-4 py-2 font-semibold transition-colors ${
                  isProcessing
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                No thanks, continue without
              </button>
            )}
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
};

export default UpsellModal;
