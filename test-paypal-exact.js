import dotenv from 'dotenv';
dotenv.config();

console.log('🧪 PayPal Exact Format Test');
console.log('============================');

const clientId = process.env.PAYPAL_CLIENT_ID_SANDBOX;
const secret = process.env.PAYPAL_SECRET_SANDBOX;

console.log(`Client ID: ${clientId?.substring(0, 10)}...`);
console.log(`Secret: ${secret?.substring(0, 5)}...`);
console.log('');

// Test with exact PayPal documentation format
async function testPayPalExactFormat() {
    try {
        console.log('🔐 Testing with PayPal\'s exact documented format...');
        
        // Create the exact auth string as per PayPal docs
        const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');
        
        const response = await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Accept-Language': 'en_US',
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'grant_type=client_credentials'
        });
        
        console.log(`Status: ${response.status}`);
        
        const data = await response.text();
        console.log(`Response: ${data}`);
        
        if (response.ok) {
            console.log('✅ PayPal authentication successful!');
            const parsed = JSON.parse(data);
            console.log(`Access Token: ${parsed.access_token?.substring(0, 20)}...`);
            console.log(`Token Type: ${parsed.token_type}`);
            console.log(`Expires In: ${parsed.expires_in} seconds`);
        } else {
            console.log('❌ PayPal authentication failed');
            
            // Additional debugging
            console.log('\n🔍 DEBUGGING INFO:');
            console.log(`Auth header length: ${auth.length}`);
            console.log(`Auth header starts with: ${auth.substring(0, 20)}...`);
            console.log(`Client ID length: ${clientId?.length}`);
            console.log(`Secret length: ${secret?.length}`);
        }
        
    } catch (error) {
        console.log('❌ Request failed:', error.message);
    }
}

testPayPalExactFormat();
