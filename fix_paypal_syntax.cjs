const fs = require('fs');

// Read the file
let content = fs.readFileSync('netlify/functions/paypal-capture-minimal.js', 'utf8');

// Fix the syntax error - add missing newline
content = content.replace(
  "const { validateServerOrder, createMinimumOrderErrorResponse, extractValidationContext } = require('./utils/minimumOrderValidation');exports.handler = async (event) => {",
  "const { validateServerOrder, createMinimumOrderErrorResponse, extractValidationContext } = require('./utils/minimumOrderValidation');\n\nexports.handler = async (event) => {"
);

// Write the file back
fs.writeFileSync('netlify/functions/paypal-capture-minimal.js', content);
console.log('URGENT: Fixed PayPal capture syntax error!');
