// Test with PayPal's official documented test credentials
// These should work if our code is correct

console.log('🧪 PayPal Official Test Credentials');
console.log('===================================');

// PayPal's documented test credentials (these are public)
const testClientId = 'AZDxjDScFpQtjWTOUtWKbyN_bDt4OgqaF4eYXlewfBP4-8aqX3PiV8e1GWU6liB2CUXlkA59kJXE7M6R';
const testSecret = 'EGnHDxD_qRPdaLdHCKiZ0UP4Z7_M7VxtQgjHHxUTi0TxtdqLD0V_NcjRcxzKQkrXBOQjFxKE6rJJGp6B';

console.log(`Test Client ID: ${testClientId.substring(0, 20)}...`);
console.log(`Test Secret: ${testSecret.substring(0, 10)}...`);
console.log('');

async function testOfficialCredentials() {
    try {
        console.log('🔐 Testing with PayPal\'s official test credentials...');
        
        const auth = Buffer.from(`${testClientId}:${testSecret}`).toString('base64');
        
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
            console.log('✅ Official test credentials work - our code is correct!');
            console.log('❌ Your app credentials need to be fixed in PayPal dashboard');
        } else {
            console.log('❌ Even official credentials failed - might be a PayPal service issue');
        }
        
    } catch (error) {
        console.log('❌ Request failed:', error.message);
    }
}

testOfficialCredentials();
