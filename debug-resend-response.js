// Debug script to test Resend API response structure
import { Resend } from 'resend';

async function testResendResponse() {
  console.log('Testing Resend API response structure...');
  
  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY not found');
    return;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  
  try {
    const result = await resend.emails.send({
      from: 'orders@bannersonthefly.com',
      to: 'test@example.com',
      subject: 'Debug Test',
      html: '<p>Testing API response structure</p>'
    });
    
    console.log('Full Resend API Response:');
    console.log(JSON.stringify(result, null, 2));
    
    console.log('\nExtracted ID using result.data?.id:', result.data?.id);
    console.log('Extracted ID using result.id:', result.id);
    console.log('Result keys:', Object.keys(result));
    
    if (result.data) {
      console.log('Result.data keys:', Object.keys(result.data));
    }
    
  } catch (error) {
    console.error('Resend API Error:');
    console.error(JSON.stringify(error, null, 2));
  }
}

testResendResponse();
