import dotenv from 'dotenv';
dotenv.config();

// Minimal test to isolate the issue
console.log('🔬 Minimal PayPal Test');
console.log('=====================');

const clientId = process.env.PAYPAL_CLIENT_ID_SANDBOX;
const secret = process.env.PAYPAL_SECRET_SANDBOX;

if (!clientId || !secret) {
    console.log('❌ Missing credentials in .env file');
    process.exit(1);
}

console.log('✅ Credentials found in .env');
console.log(`Client ID: ${clientId.length} chars`);
console.log(`Secret: ${secret.length} chars`);
console.log('');

// Test just the basic auth encoding
const basicAuth = Buffer.from(`${clientId}:${secret}`).toString('base64');
console.log(`Basic Auth: ${basicAuth.substring(0, 30)}...`);
console.log(`Auth Length: ${basicAuth.length}`);
console.log('');

// Minimal request
async function minimalTest() {
    console.log('🚀 Making minimal request...');
    
    try {
        const response = await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${basicAuth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: 'grant_type=client_credentials'
        });
        
        const responseText = await response.text();
        
        console.log(`HTTP Status: ${response.status}`);
        console.log(`Response Headers:`, Object.fromEntries(response.headers.entries()));
        console.log(`Response Body: ${responseText}`);
        
        if (response.status === 401) {
            console.log('\n🔍 401 UNAUTHORIZED ANALYSIS:');
            console.log('This means PayPal rejected your credentials.');
            console.log('Common causes:');
            console.log('1. App not linked to a verified sandbox business account');
            console.log('2. Credentials copied incorrectly');
            console.log('3. App disabled or restricted');
            console.log('4. Sandbox account needs verification');
            console.log('\n💡 NEXT STEPS:');
            console.log('1. Check PayPal Developer Dashboard > Sandbox > Accounts');
            console.log('2. Verify you have a business account');
            console.log('3. Check if Default Application is linked to business account');
            console.log('4. Try creating a new app with explicit business account link');
        }
        
    } catch (error) {
        console.log(`❌ Network Error: ${error.message}`);
    }
}

minimalTest();
