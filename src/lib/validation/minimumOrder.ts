/**
 * Minimum Order Validation Utility
 * Centralized validation for $20.00 minimum order requirement
 */

export const MINIMUM_ORDER_AMOUNT = 20.00; // $20.00 minimum
export const MINIMUM_ORDER_CENTS = 2000; // 2000 cents = $20.00

export interface MinimumOrderValidationResult {
  isValid: boolean;
  currentAmount: number;
  minimumRequired: number;
  shortfall: number;
  message: string;
  suggestions: string[];
}

export interface OrderValidationContext {
  isAdmin?: boolean;
  isTest?: boolean;
  bypassValidation?: boolean;
}

/**
 * Validates if an order meets the minimum amount requirement
 * @param totalCents - Total order amount in cents
 * @param context - Additional context for validation (admin, test, etc.)
 * @returns Validation result with details and suggestions
 */
export function validateMinimumOrder(
  totalCents: number, 
  context: OrderValidationContext = {}
): MinimumOrderValidationResult {
  const currentAmount = totalCents / 100;
  const shortfall = Math.max(0, MINIMUM_ORDER_AMOUNT - currentAmount);
  const isValid = totalCents >= MINIMUM_ORDER_CENTS;

  // Admin override - allow bypass for testing
  if (context.isAdmin && context.bypassValidation) {
    return {
      isValid: true,
      currentAmount,
      minimumRequired: MINIMUM_ORDER_AMOUNT,
      shortfall: 0,
      message: 'Admin override: Minimum order validation bypassed',
      suggestions: []
    };
  }

  // Test mode override (for development/testing)
  if (context.isTest && process.env.NODE_ENV === 'development') {
    return {
      isValid: true,
      currentAmount,
      minimumRequired: MINIMUM_ORDER_AMOUNT,
      shortfall: 0,
      message: 'Test mode: Minimum order validation bypassed',
      suggestions: []
    };
  }

  if (isValid) {
    return {
      isValid: true,
      currentAmount,
      minimumRequired: MINIMUM_ORDER_AMOUNT,
      shortfall: 0,
      message: 'Order meets minimum requirement',
      suggestions: []
    };
  }

  // Generate helpful suggestions for increasing order value
  const suggestions = generateOrderSuggestions(shortfall);

  return {
    isValid: false,
    currentAmount,
    minimumRequired: MINIMUM_ORDER_AMOUNT,
    shortfall,
    message: `Order total of $${currentAmount.toFixed(2)} is below our $${MINIMUM_ORDER_AMOUNT.toFixed(2)} minimum. Please add $${shortfall.toFixed(2)} more to your order.`,
    suggestions
  };
}

/**
 * Generate helpful suggestions for meeting minimum order requirement
 */
function generateOrderSuggestions(shortfall: number): string[] {
  const suggestions: string[] = [];

  if (shortfall <= 5) {
    suggestions.push('Consider increasing your banner quantity by 1');
    suggestions.push('Add rope reinforcement for durability');
  } else if (shortfall <= 10) {
    suggestions.push('Increase your banner size slightly');
    suggestions.push('Add pole pockets for easy hanging');
    suggestions.push('Consider upgrading to premium 18oz material');
  } else {
    suggestions.push('Increase your banner quantity');
    suggestions.push('Consider a larger banner size');
    suggestions.push('Add multiple banners to your order');
    suggestions.push('Upgrade to premium materials and add-ons');
  }

  return suggestions;
}

/**
 * Format minimum order error message for user display
 */
export function formatMinimumOrderError(
  currentAmount: number,
  shortfall: number,
  includeHelp: boolean = true
): string {
  let message = `Minimum order amount is $${MINIMUM_ORDER_AMOUNT.toFixed(2)}. `;
  message += `Your current total is $${currentAmount.toFixed(2)}. `;
  message += `Please add $${shortfall.toFixed(2)} more to proceed.`;

  if (includeHelp) {
    message += '\n\nTip: Try increasing quantity, size, or adding premium options!';
  }

  return message;
}

/**
 * Check if order qualifies for processing (frontend validation)
 */
export function canProceedToCheckout(totalCents: number, context: OrderValidationContext = {}): boolean {
  const validation = validateMinimumOrder(totalCents, context);
  return validation.isValid;
}

/**
 * Server-side validation for PayPal order creation
 */
export function validateServerOrder(totalCents: number, context: OrderValidationContext = {}): {
  valid: boolean;
  error?: string;
  code?: string;
} {
  const validation = validateMinimumOrder(totalCents, context);
  
  if (!validation.isValid) {
    return {
      valid: false,
      error: validation.message,
      code: 'MINIMUM_ORDER_NOT_MET'
    };
  }

  return { valid: true };
}

/**
 * Utility to check if current environment allows test orders
 */
export function isTestEnvironment(): boolean {
  return process.env.NODE_ENV === 'development' || 
         process.env.PAYPAL_ENV === 'sandbox' ||
         process.env.ALLOW_TEST_ORDERS === '1';
}

/**
 * Constants for easy import
 */
export const MinimumOrderConstants = {
  AMOUNT: MINIMUM_ORDER_AMOUNT,
  CENTS: MINIMUM_ORDER_CENTS,
  CURRENCY: 'USD'
} as const;
