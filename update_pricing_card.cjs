const fs = require('fs');

// Read the file
let content = fs.readFileSync('src/components/design/PricingCard.tsx', 'utf8');

// Add the size validation import
content = content.replace(
  "import { useQuoteStore } from '@/store/quote';",
  "import { useQuoteStore, ORDER_SIZE_LIMIT_SQFT } from '@/store/quote';"
);

// Add AlertTriangle import for the warning icon
content = content.replace(
  "import { ShoppingCart, CreditCard } from 'lucide-react';",
  "import { ShoppingCart, CreditCard, AlertTriangle } from 'lucide-react';"
);

// Add size validation logic after the existing validation
const sizeValidationLogic = `
  // Size validation
  const squareFootage = quote.getSquareFootage();
  const isOverSizeLimit = quote.isOverSizeLimit();
  const sizeLimitMessage = quote.getSizeLimitMessage();
  const canProceedWithSize = !isOverSizeLimit;`;

content = content.replace(
  'const canProceed = canProceedToCheckout(quote) && quote.file;',
  `const canProceed = canProceedToCheckout(quote) && quote.file;${sizeValidationLogic}
  const finalCanProceed = canProceed && canProceedWithSize;`
);

// Update button disabled states
content = content.replace(
  /className={\`w-full py-5 rounded-2xl font-bold text-xl shadow-2xl transition-all duration-300 flex items-center justify-center gap-3 relative overflow-hidden \$\{canProceed \?/g,
  'className={`w-full py-5 rounded-2xl font-bold text-xl shadow-2xl transition-all duration-300 flex items-center justify-center gap-3 relative overflow-hidden ${finalCanProceed ?'
);

// Add size limit warning message before the buttons
const warningMessage = `
          {/* Size Limit Warning */}
          {isOverSizeLimit && (
            <div className="mb-6 p-4 bg-orange-50 border-2 border-orange-200 rounded-xl">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-6 w-6 text-orange-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-orange-800 mb-1">Custom Quote Required</h4>
                  <p className="text-orange-700 text-sm leading-relaxed">
                    {sizeLimitMessage}
                  </p>
                  <p className="text-orange-600 text-xs mt-2">
                    Current size: {squareFootage.toFixed(1)} sq ft (limit: {ORDER_SIZE_LIMIT_SQFT} sq ft)
                  </p>
                </div>
              </div>
            </div>
          )}`;

content = content.replace(
  '          {/* Action Buttons */}',
  `${warningMessage}

          {/* Action Buttons */}`
);

// Write the file back
fs.writeFileSync('src/components/design/PricingCard.tsx', content);
console.log('PricingCard updated with size validation!');
