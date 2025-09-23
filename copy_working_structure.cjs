const fs = require('fs');

// Read the working paypal-create-order.js to see its structure
const workingContent = fs.readFileSync('netlify/functions/paypal-create-order.js', 'utf8');

// Extract just the handler part to see the exact format
const handlerMatch = workingContent.match(/exports\.handler = async \(event[^}]+\{[\s\S]*\};/);

if (handlerMatch) {
  console.log('Working function handler format:');
  console.log(handlerMatch[0].substring(0, 200) + '...');
} else {
  console.log('Could not find handler in working function');
}

// Let's create a minimal test function using the exact same structure
const testContent = \`const { randomUUID } = require('crypto');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { orderID } = JSON.parse(event.body || '{}');
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'PayPal capture function is working',
        orderID: orderID || 'test',
        timestamp: new Date().toISOString()
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};\`;

// Write the test version
fs.writeFileSync('netlify/functions/paypal-capture-minimal.js', testContent);
console.log('Created test function with working structure');
