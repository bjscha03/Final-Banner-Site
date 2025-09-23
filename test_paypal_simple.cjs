const fs = require('fs');

// Create a simple test version without the utils import
const testContent = `
// Test PayPal capture function
exports.handler = async (event) => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ test: 'success' })
  };
};
`;

fs.writeFileSync('test-paypal.js', testContent);

// Test if it loads
try {
  const func = require('./test-paypal.js');
  console.log('✅ Simple function loads');
  console.log('✅ Handler exists:', typeof func.handler);
  
  // Clean up
  fs.unlinkSync('test-paypal.js');
} catch (error) {
  console.error('❌ Error:', error.message);
}
