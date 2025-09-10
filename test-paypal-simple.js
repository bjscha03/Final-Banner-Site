import dotenv from 'dotenv';
dotenv.config();

async function testPayPalAuth() {
  const clientId = process.env.PAYPAL_CLIENT_ID_SANDBOX;
  const secret = process.env.PAYPAL_SECRET_SANDBOX;
  
  console.log('🧪 Simple PayPal Test');
  console.log('====================');
  console.log(`Client ID: ${clientId?.substring(0, 10)}...`);
  console.log(`Secret: ${secret?.substring(0, 5)}...`);
  console.log('');
  
  if (!clientId || !secret) {
    console.log('❌ Missing PayPal credentials');
    return;
  }
  
  // Test with minimal request
  const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');
  
  try {
    console.log('🔐 Testing minimal PayPal auth request...');
    
    const response = await fetch('https://api.sandbox.paypal.com/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: 'grant_type=client_credentials'
    });
    
    console.log(`Status: ${response.status}`);
    
    const responseText = await response.text();
    console.log(`Response: ${responseText}`);
    
    if (response.ok) {
      console.log('✅ PayPal authentication successful!');
      const data = JSON.parse(responseText);
      console.log(`Token type: ${data.token_type}`);
      console.log(`Expires in: ${data.expires_in} seconds`);
    } else {
      console.log('❌ PayPal authentication failed');
      
      // Check if it's a specific error
      try {
        const errorData = JSON.parse(responseText);
        if (errorData.error === 'invalid_client') {
          console.log('');
          console.log('🔍 DIAGNOSIS: Invalid Client Error');
          console.log('This usually means:');
          console.log('1. The PayPal app is not activated/live');
          console.log('2. The credentials are from a different environment');
          console.log('3. The app has been disabled or restricted');
          console.log('4. The credentials have been regenerated');
          console.log('');
          console.log('💡 SOLUTION: Check your PayPal app status in the developer dashboard');
        }
      } catch (e) {
        // Response wasn't JSON
      }
    }
    
  } catch (error) {
    console.log('❌ Network error:', error.message);
  }
}

testPayPalAuth();
