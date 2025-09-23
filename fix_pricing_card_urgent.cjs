const fs = require('fs');

// Read the file
let content = fs.readFileSync('src/components/design/PricingCard.tsx', 'utf8');

// I need to find where the size validation logic was supposed to be added
// and fix the variable naming issue

// First, let's see what the current structure looks like around line 137
console.log('Looking for the canProceed definition...');

// The issue is that my script replaced canProceed with finalCanProceed in the className
// but didn't properly define finalCanProceed. Let me fix this:

// 1. Fix the className references back to canProceed for now
content = content.replace(/finalCanProceed/g, 'canProceed');

// 2. Now let's properly add the size validation logic
// Find the line with "const canProceed = minimumOrderValidation.isValid;"
const oldCanProceedLine = 'const canProceed = minimumOrderValidation.isValid;';

const newCanProceedLogic = `const canProceed = minimumOrderValidation.isValid;

  // Size validation
  const squareFootage = quote.getSquareFootage();
  const isOverSizeLimit = quote.isOverSizeLimit();
  const sizeLimitMessage = quote.getSizeLimitMessage();
  const canProceedWithSize = !isOverSizeLimit;
  const finalCanProceed = canProceed && canProceedWithSize;`;

content = content.replace(oldCanProceedLine, newCanProceedLogic);

// 3. Now update the className references to use finalCanProceed
content = content.replace(
  /className={\`w-full py-5 rounded-2xl font-bold text-xl shadow-2xl transition-all duration-300 flex items-center justify-center gap-3 relative overflow-hidden \$\{canProceed \?/g,
  'className={`w-full py-5 rounded-2xl font-bold text-xl shadow-2xl transition-all duration-300 flex items-center justify-center gap-3 relative overflow-hidden ${finalCanProceed ?'
);

// 4. Update the disabled attributes
content = content.replace('disabled={!canProceed}', 'disabled={!finalCanProceed}');

// Write the file back
fs.writeFileSync('src/components/design/PricingCard.tsx', content);
console.log('URGENT: Fixed finalCanProceed variable issue!');
