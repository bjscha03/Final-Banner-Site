const fs = require('fs');

// Read the file
let content = fs.readFileSync('src/store/quote.ts', 'utf8');

// Add the missing store methods before the closing }));
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

// Replace the closing of the store
content = content.replace(
  '  })),\n}));',
  `  }))${storeMethods}\n}));`
);

// Also need to change (set) to (set, get) in the create function
content = content.replace(
  'export const useQuoteStore = create<QuoteState>((set, get) => ({',
  'export const useQuoteStore = create<QuoteState>((set, get) => ({'
);

// Write the file back
fs.writeFileSync('src/store/quote.ts', content);
console.log('URGENT: Added missing store methods!');
