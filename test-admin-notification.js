// Quick test to trigger admin notification
const fetch = require('node-fetch');

async function testAdminNotification() {
  try {
    // Get the most recent order ID from the database
    const response = await fetch('https://bannersonthefly.com/.netlify/functions/email-monitoring');
    const data = await response.json();
    
    // Find a recent order confirmation to get the order ID
    const recentOrder = data.recent_emails.find(email => 
      email.type === 'order.confirmation' && email.status === 'sent'
    );
    
    if (!recentOrder) {
      console.log('No recent orders found to test with');
      return;
    }
    
    console.log('Testing with order ID:', recentOrder.order_id);
    
    // Trigger notify-order function
    const notifyResponse = await fetch('https://bannersonthefly.com/.netlify/functions/notify-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ orderId: recentOrder.order_id }),
    });
    
    const result = await notifyResponse.json();
    console.log('Notify-order response:', result);
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testAdminNotification();
