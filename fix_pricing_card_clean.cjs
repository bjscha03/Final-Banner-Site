const fs = require('fs');

// Read the file
let content = fs.readFileSync('src/components/design/PricingCard.tsx', 'utf8');

// Remove the duplicate and conflicting size validation code
const duplicateCode = `
  // Size validation
  const squareFootage = quote.getSquareFootage();
  const isOverSizeLimit = quote.isOverSizeLimit();
  const sizeLimitMessage = quote.getSizeLimitMessage();
  const canProceedWithSize = !isOverSizeLimit;
  const canProceed = canProceed && canProceedWithSize;`;

content = content.replace(duplicateCode, '');

// Write the file back
fs.writeFileSync('src/components/design/PricingCard.tsx', content);
console.log('Removed duplicate size validation code!');
