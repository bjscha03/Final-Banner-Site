const fs = require('fs');

// Read the file
let content = fs.readFileSync('netlify/functions/paypal-capture-minimal.js', 'utf8');

// Fix the require path
content = content.replace(
  "const { validateServerOrder, createMinimumOrderErrorResponse, extractValidationContext } = require('./utils/minimumOrderValidation');",
  "const { validateServerOrder, createMinimumOrderErrorResponse, extractValidationContext } = require('./utils/minimumOrderValidation.js');"
);

// Write the file back
fs.writeFileSync('netlify/functions/paypal-capture-minimal.js', content);
console.log('Fixed PayPal require path!');
