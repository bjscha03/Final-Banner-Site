import dotenv from 'dotenv';
dotenv.config();

console.log('🔍 PayPal Debug Test');
console.log('===================');

const clientId = process.env.PAYPAL_CLIENT_ID_SANDBOX;
const secret = process.env.PAYPAL_SECRET_SANDBOX;

console.log(`Client ID: ${clientId}`);
console.log(`Secret: ${secret}`);
console.log('');

// Test multiple formats and endpoints
async function debugPayPal() {
    const tests = [
        {
            name: 'Standard Sandbox Endpoint',
            url: 'https://api-m.sandbox.paypal.com/v1/oauth2/token',
            headers: {
                'Accept': 'application/json',
                'Accept-Language': 'en_US',
                'Authorization': `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'grant_type=client_credentials'
        },
        {
            name: 'Alternative Sandbox Endpoint',
            url: 'https://api.sandbox.paypal.com/v1/oauth2/token',
            headers: {
                'Accept': 'application/json',
                'Accept-Language': 'en_US',
                'Authorization': `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'grant_type=client_credentials'
        }
    ];

    for (const test of tests) {
        console.log(`\n🧪 Testing: ${test.name}`);
        console.log(`URL: ${test.url}`);
        
        try {
            const response = await fetch(test.url, {
                method: 'POST',
                headers: test.headers,
                body: test.body
            });
            
            console.log(`Status: ${response.status}`);
            const data = await response.text();
            console.log(`Response: ${data.substring(0, 200)}${data.length > 200 ? '...' : ''}`);
            
            if (response.ok) {
                console.log('✅ SUCCESS!');
                return;
            }
            
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
        }
    }
    
    console.log('\n🔍 CREDENTIAL ANALYSIS:');
    console.log(`Client ID valid format: ${/^[A-Za-z0-9_-]+$/.test(clientId)}`);
    console.log(`Secret valid format: ${/^[A-Za-z0-9_-]+$/.test(secret)}`);
    console.log(`Client ID length: ${clientId?.length} (should be ~80)`);
    console.log(`Secret length: ${secret?.length} (should be ~80)`);
    
    const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');
    console.log(`Base64 auth: ${auth.substring(0, 50)}...`);
}

debugPayPal();
