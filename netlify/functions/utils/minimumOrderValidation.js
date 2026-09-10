/**
 * Server-side Minimum Order Validation Utility
 * Validates orders against $20.00 minimum requirement
 */

const MINIMUM_ORDER_CENTS = 2000; // $20.00 minimum
const MINIMUM_ORDER_AMOUNT = 20.00;

/**
 * Validates if an order meets the minimum order requirement
 * @param {number} totalCents - Order total in cents
 * @param {Object} context - Validation context (admin, test mode, etc.)
 * @returns {Object} Validation result
 */
function validateServerOrder(totalCents, context = {}) {
  // Admin bypass
  if (context.isAdmin && context.bypassValidation) {
    return {
      valid: true,
      code: 'ADMIN_OVERRIDE',
      message: 'Admin override - minimum order validation bypassed',
      details: {
        totalCents,
        minimumRequired: MINIMUM_ORDER_CENTS,
        isAdmin: true
      }
    };
  }

  // Test environment bypass (if needed)
  if (context.isTestMode) {
    return {
      valid: true,
      code: 'TEST_MODE',
      message: 'Test mode - minimum order validation bypassed',
      details: {
        totalCents,
        minimumRequired: MINIMUM_ORDER_CENTS,
        isTestMode: true
      }
    };
  }

  // Check minimum order requirement
  if (totalCents < MINIMUM_ORDER_CENTS) {
    const shortfall = MINIMUM_ORDER_CENTS - totalCents;
    return {
      valid: false,
      code: 'MINIMUM_ORDER_NOT_MET',
      message: `Order total $${(totalCents / 100).toFixed(2)} is below the minimum requirement of $${MINIMUM_ORDER_AMOUNT}`,
      details: {
        totalCents,
        minimumRequired: MINIMUM_ORDER_CENTS,
        shortfall,
        shortfallAmount: shortfall / 100
      }
    };
  }

  // Order meets minimum requirement
  return {
    valid: true,
    code: 'MINIMUM_ORDER_MET',
    message: 'Order meets minimum requirement',
    details: {
      totalCents,
      minimumRequired: MINIMUM_ORDER_CENTS
    }
  };
}

/**
 * Creates a standardized error response for minimum order validation failures
 * @param {Object} validationResult - Result from validateServerOrder
 * @returns {Object} HTTP response object
 */
function createMinimumOrderErrorResponse(validationResult) {
  const { details } = validationResult;
  
  return {
    statusCode: 400,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: JSON.stringify({
      error: 'MINIMUM_ORDER_NOT_MET',
      message: validationResult.message,
      details: {
        currentTotal: `$${(details.totalCents / 100).toFixed(2)}`,
        minimumRequired: `$${(details.minimumRequired / 100).toFixed(2)}`,
        shortfall: `$${(details.shortfall / 100).toFixed(2)}`,
        suggestions: [
          'Increase the quantity of your current banner',
          'Choose a larger banner size',
          'Add additional banners to your order',
          'Consider adding grommets, pole pockets, or other options'
        ]
      }
    })
  };
}

/**
 * Extracts validation context from the request event
 * @param {Object} event - Netlify function event object
 * @returns {Object} Validation context
 */
function extractValidationContext(event) {
  const headers = event.headers || {};
  
  return {
    isAdmin: headers['x-admin-override'] === 'true',
    bypassValidation: headers['x-bypass-validation'] === 'true',
    isTestMode: headers['x-test-mode'] === 'true' || process.env.NODE_ENV === 'development',
    userAgent: headers['user-agent'] || '',
    origin: headers.origin || headers.referer || ''
  };
}

module.exports = {
  validateServerOrder,
  createMinimumOrderErrorResponse,
  extractValidationContext,
  MINIMUM_ORDER_CENTS,
  MINIMUM_ORDER_AMOUNT
};
