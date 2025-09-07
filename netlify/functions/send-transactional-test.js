// netlify/functions/send-transactional-test.js
const { sendEmail } = require('../../src/lib/email');

exports.handler = async (event) => {
  try {
    // Get test type from query params
    const testType = event.queryStringParameters?.type || 'order.confirmation';
    const to = event.queryStringParameters?.to || 'bjscha02@gmail.com';
    
    let payload;
    
    // Create test payload based on type
    switch (testType) {
      case 'user.verify':
        payload = {
          to,
          verifyUrl: 'https://bannersonthefly.com/verify?token=test123',
          userName: 'Test User'
        };
        break;
        
      case 'user.reset':
        payload = {
          to,
          resetUrl: 'https://bannersonthefly.com/reset?token=test123',
          userName: 'Test User'
        };
        break;
        
      case 'order.shipped':
        payload = {
          to,
          order: {
            id: 'test-order-123',
            orderNumber: 'BO12345',
            customerName: 'Test Customer',
            items: [
              {
                name: 'Custom Banner 24"×36"',
                quantity: 2,
                price: 89.98,
                options: 'Material: Vinyl • Grommets: 4 corners • Rope: 10.0 ft'
              }
            ],
            subtotal: 89.98,
            tax: 7.20,
            total: 97.18,
            shippingAddress: {
              name: 'Test Customer',
              address1: '123 Main St',
              city: 'Anytown',
              state: 'CA',
              zip: '12345'
            }
          },
          trackingNumber: '1Z999AA1234567890',
          trackingUrl: 'https://www.fedex.com/track?tracknumber=1Z999AA1234567890',
          carrier: 'FedEx'
        };
        break;
        
      case 'order.canceled':
        payload = {
          to,
          order: {
            id: 'test-order-123',
            orderNumber: 'BO12345',
            customerName: 'Test Customer',
            items: [
              {
                name: 'Custom Banner 24"×36"',
                quantity: 2,
                price: 89.98,
                options: 'Material: Vinyl • Grommets: 4 corners • Rope: 10.0 ft'
              }
            ],
            subtotal: 89.98,
            tax: 7.20,
            total: 97.18
          }
        };
        break;
        
      default: // order.confirmation
        payload = {
          to,
          order: {
            id: 'test-order-123',
            orderNumber: 'BO12345',
            customerName: 'Test Customer',
            items: [
              {
                name: 'Custom Banner 24"×36"',
                quantity: 2,
                price: 89.98,
                options: 'Material: Vinyl • Grommets: 4 corners • Rope: 10.0 ft'
              },
              {
                name: 'Custom Banner 18"×24"',
                quantity: 1,
                price: 34.99,
                options: 'Material: Mesh • Grommets: None'
              }
            ],
            subtotal: 124.97,
            tax: 10.00,
            total: 134.97,
            shippingAddress: {
              name: 'Test Customer',
              address1: '123 Main St',
              address2: 'Suite 100',
              city: 'Anytown',
              state: 'CA',
              zip: '12345'
            }
          },
          invoiceUrl: 'https://bannersonthefly.com/orders/test-order-123'
        };
    }
    
    // Send email using the wrapper
    const result = await sendEmail(testType, payload);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...result,
        testType,
        sentTo: to
      })
    };

  } catch (error) {
    console.error('Transactional test email failed:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        ok: false, 
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};
