const fs = require('fs');

// Read the file
let content = fs.readFileSync('src/store/quote.ts', 'utf8');

// Add the validation methods to the interface
const interfaceAddition = `  // Computed properties for validation
  getSquareFootage: () => number;
  isOverSizeLimit: () => boolean;
  getSizeLimitMessage: () => string | null;`;

content = content.replace(
  '  set: (partial: Partial<QuoteState>) => void;\n  setFromQuickQuote: (params: QuickQuoteParams) => void;\n}',
  `  set: (partial: Partial<QuoteState>) => void;\n  setFromQuickQuote: (params: QuickQuoteParams) => void;\n${interfaceAddition}\n}`
);

// Add helper functions after the interface
const helperFunctions = `
// Helper functions for order size validation
export const calculateSquareFootage = (widthIn: number, heightIn: number): number => {
  return (widthIn * heightIn) / 144; // Convert square inches to square feet
};

export const ORDER_SIZE_LIMIT_SQFT = 1000;

export const getSizeLimitMessage = (sqft: number): string | null => {
  if (sqft > ORDER_SIZE_LIMIT_SQFT) {
    return \`Orders over 1,000 sq ft require a custom quote. Please contact us at (555) 123-4567 or support@bannersonthefly.com before placing your order.\`;
  }
  return null;
};`;

content = content.replace(
  'export const useQuoteStore = create<QuoteState>((set) => ({',
  helperFunctions + '\n\nexport const useQuoteStore = create<QuoteState>((set, get) => ({'
);

// Add the computed methods to the store implementation
const storeMethods = `,
  // Computed validation methods
  getSquareFootage: () => {
    const state = get();
    return calculateSquareFootage(state.widthIn, state.heightIn);
  },
  isOverSizeLimit: () => {
    const sqft = get().getSquareFootage();
    return sqft > ORDER_SIZE_LIMIT_SQFT;
  },
  getSizeLimitMessage: () => {
    const sqft = get().getSquareFootage();
    return getSizeLimitMessage(sqft);
  }`;

content = content.replace(
  '    material: params.material,\n    previewScalePct: 100\n  }))\n}));',
  `    material: params.material,\n    previewScalePct: 100\n  }))${storeMethods}\n}));`
);

// Write the file back
fs.writeFileSync('src/store/quote.ts', content);
console.log('Size validation added to quote store!');
