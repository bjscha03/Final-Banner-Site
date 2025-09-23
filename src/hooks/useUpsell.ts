import { useState, useCallback } from 'react';
import { QuoteState } from '@/store/quote';
import { UpsellOption } from '@/components/cart/UpsellModal';

const STORAGE_KEY = 'skipUpsell';

export interface UseUpsellOptions {
  onAddToCart: (quote: QuoteState) => void;
  onCheckout: (quote: QuoteState) => void;
}

export interface UseUpsellReturn {
  showUpsellModal: boolean;
  upsellActionType: 'cart' | 'checkout' | null;
  handleAddToCart: (quote: QuoteState) => void;
  handleCheckout: (quote: QuoteState) => void;
  handleUpsellContinue: (selectedOptions: UpsellOption[], dontAskAgain: boolean) => void;
  handleUpsellClose: () => void;
}

/**
 * Hook that manages upsell modal logic for cart actions
 * Intercepts addToCart and checkout actions to show upsell modal when appropriate
 */
export const useUpsell = ({ onAddToCart, onCheckout }: UseUpsellOptions): UseUpsellReturn => {
  const [showUpsellModal, setShowUpsellModal] = useState(false);
  const [upsellActionType, setUpsellActionType] = useState<'cart' | 'checkout' | null>(null);
  const [pendingQuote, setPendingQuote] = useState<QuoteState | null>(null);

  /**
   * Check if upsell should be skipped based on localStorage preference
   */
  const shouldSkipUpsell = useCallback((): boolean => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }, []);

  /**
   * Check if the current quote configuration needs upsell
   * Returns true if any of grommets, rope, or pole pockets are missing
   */
  const needsUpsell = useCallback((quote: QuoteState): boolean => {
    return (
      quote.grommets === 'none' ||
      !quote.addRope ||
      quote.polePockets === 'none'
    );
  }, []);

  /**
   * Apply selected upsell options to the quote
   */
  const applyUpsellOptions = useCallback((quote: QuoteState, selectedOptions: UpsellOption[]): QuoteState => {
    const updatedQuote = { ...quote };

    selectedOptions.forEach(option => {
      if (!option.selected) return;

      switch (option.id) {
        case 'grommets':
          updatedQuote.grommets = 'every-2-3ft'; // Default to standard spacing
          break;
        case 'rope':
          updatedQuote.addRope = true;
          break;
        case 'polePockets':
          updatedQuote.polePockets = 'top-bottom'; // Default to top & bottom
          updatedQuote.polePocketSize = '2'; // Default to 2" size
          break;
      }
    });

    return updatedQuote;
  }, []);

  /**
   * Handle add to cart action with upsell check
   */
  const handleAddToCart = useCallback((quote: QuoteState) => {
    // Skip upsell if user has opted out or no upsell needed
    if (shouldSkipUpsell() || !needsUpsell(quote)) {
      onAddToCart(quote);
      return;
    }

    // Show upsell modal
    setPendingQuote(quote);
    setUpsellActionType('cart');
    setShowUpsellModal(true);
  }, [shouldSkipUpsell, needsUpsell, onAddToCart]);

  /**
   * Handle checkout action with upsell check
   */
  const handleCheckout = useCallback((quote: QuoteState) => {
    // Skip upsell if user has opted out or no upsell needed
    if (shouldSkipUpsell() || !needsUpsell(quote)) {
      onCheckout(quote);
      return;
    }

    // Show upsell modal
    setPendingQuote(quote);
    setUpsellActionType('checkout');
    setShowUpsellModal(true);
  }, [shouldSkipUpsell, needsUpsell, onCheckout]);

  /**
   * Handle upsell modal continue action
   */
  const handleUpsellContinue = useCallback((selectedOptions: UpsellOption[], dontAskAgain: boolean) => {
    if (!pendingQuote || !upsellActionType) return;

    // Save "don't ask again" preference
    if (dontAskAgain) {
      try {
        localStorage.setItem(STORAGE_KEY, 'true');
      } catch {
        // Ignore localStorage errors
      }
    }

    // Apply selected options to quote
    const updatedQuote = applyUpsellOptions(pendingQuote, selectedOptions);

    // Execute the original action with updated quote
    if (upsellActionType === 'cart') {
      onAddToCart(updatedQuote);
    } else {
      onCheckout(updatedQuote);
    }

    // Reset modal state
    setShowUpsellModal(false);
    setUpsellActionType(null);
    setPendingQuote(null);
  }, [pendingQuote, upsellActionType, applyUpsellOptions, onAddToCart, onCheckout]);

  /**
   * Handle upsell modal close action
   */
  const handleUpsellClose = useCallback(() => {
    setShowUpsellModal(false);
    setUpsellActionType(null);
    setPendingQuote(null);
  }, []);

  return {
    showUpsellModal,
    upsellActionType,
    handleAddToCart,
    handleCheckout,
    handleUpsellContinue,
    handleUpsellClose
  };
};

/**
 * Utility function to reset upsell preferences (useful for testing)
 */
export const resetUpsellPreferences = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore localStorage errors
  }
};

/**
 * Utility function to check current upsell preference
 */
export const getUpsellPreference = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};
