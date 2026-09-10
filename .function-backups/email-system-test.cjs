// netlify/functions/email-system-test.js
const { sendEmail, logEmailAttempt } = require('../../src/lib/email');
const { neon } = require('@neondatabase/serverless');

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const params = new URLSearchParams(event.rawQuery || '');
    const testEmail = params.get('to') || 'test@example.com';
    const testType = params.get('type') || 'all';
    
    const results = {
      timestamp: new Date().toISOString(),
      testEmail,
      testType,
      tests: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0
      }
    };

    // Test database connection
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    const db = dbUrl ? neon(dbUrl) : null;
    
    if (!db) {
      results.tests.push({
        name: 'Database Connection',
        status: 'failed',
        error: 'Database URL not configured'
      });
    } else {
      try {
        await db`SELECT 1`;
        results.tests.push({
          name: 'Database Connection',
          status: 'passed'
        });
      } catch (error) {
        results.tests.push({
          name: 'Database Connection',
          status: 'failed',
          error: error.message
        });
      }
    }

    // Test email configurations
    const configTests = [
      { name: 'RESEND_API_KEY', value: !!process.env.RESEND_API_KEY },
      { name: 'EMAIL_FROM', value: !!process.env.EMAIL_FROM },
      { name: 'EMAIL_REPLY_TO', value: !!process.env.EMAIL_REPLY_TO },
      { name: 'SITE_URL', value: !!(process.env.SITE_URL || process.env.PUBLIC_SITE_URL) }
    ];

    configTests.forEach(test => {
      results.tests.push({
        name: `Config: ${test.name}`,
        status: test.value ? 'passed' : 'failed',
        error: test.value ? undefined : `${test.name} not configured`
      });
    });

    // Test email types
    const emailTests = [];
    
    if (testType === 'all' || testType === 'plain') {
      emailTests.push({
        type: '__plain__',
        payload: {
          to: testEmail,
          subject: 'Email System Test - Plain',
          text: 'This is a plain text test email from the email system test suite.'
        }
      });
    }

    if (testType === 'all' || testType === 'user.verify') {
      emailTests.push({
        type: 'user.verify',
        payload: {
          to: testEmail,
          verifyUrl: `${process.env.SITE_URL || 'https://www.bannersonthefly.com'}/verify?token=test-token-123`,
          userName: 'Test User'
        }
      });
    }

    if (testType === 'all' || testType === 'user.reset') {
      emailTests.push({
        type: 'user.reset',
        payload: {
          to: testEmail,
          resetUrl: `${process.env.SITE_URL || 'https://www.bannersonthefly.com'}/reset-password?token=test-token-456`,
          userName: 'Test User'
        }
      });
    }

    if (testType === 'all' || testType === 'order.confirmation') {
      emailTests.push({
        type: 'order.confirmation',
        payload: {
          to: testEmail,
          order: {
            id: 'test-order-789',
            number: 'TEST001',
            customerName: 'Test Customer',
            items: [
              {
                name: 'Custom Banner 48" × 24"',
                quantity: 1,
                price: 36.00,
                options: 'Material: 13oz Vinyl • Grommets: 4 corners'
              }
            ],
            subtotal: 36.00,
            tax: 2.16,
            total: 38.16
          },
          invoiceUrl: `${process.env.SITE_URL || 'https://www.bannersonthefly.com'}/orders/test-order-789`
        }
      });
    }

    // Execute email tests
    for (const emailTest of emailTests) {
      try {
        const result = await sendEmail(emailTest.type, emailTest.payload);
        
        results.tests.push({
          name: `Email: ${emailTest.type}`,
          status: result.ok ? 'passed' : 'failed',
          error: result.ok ? undefined : result.error,
          details: result.ok ? { id: result.id } : result.details,
          providerMsgId: result.ok ? result.id : undefined
        });

        // Test logging functionality
        if (db) {
          try {
            await logEmailAttempt({
              type: `${emailTest.type}-test`,
              to: testEmail,
              status: result.ok ? 'sent' : 'error',
              providerMsgId: result.ok ? result.id : undefined,
              errorMessage: result.ok ? undefined : result.error
            });
            
            results.tests.push({
              name: `Logging: ${emailTest.type}`,
              status: 'passed'
            });
          } catch (logError) {
            results.tests.push({
              name: `Logging: ${emailTest.type}`,
              status: 'failed',
              error: logError.message
            });
          }
        }

      } catch (error) {
        results.tests.push({
          name: `Email: ${emailTest.type}`,
          status: 'failed',
          error: error.message
        });
      }
    }

    // Calculate summary
    results.summary.total = results.tests.length;
    results.summary.passed = results.tests.filter(t => t.status === 'passed').length;
    results.summary.failed = results.tests.filter(t => t.status === 'failed').length;

    // Test webhook processing (if database available)
    if (db) {
      try {
        const recentEmails = await db`
          SELECT type, status, created_at, provider_msg_id
          FROM email_events
          WHERE created_at > NOW() - INTERVAL '1 hour'
          ORDER BY created_at DESC
          LIMIT 5
        `;
        
        results.recentEmails = recentEmails;
      } catch (error) {
        console.error('Failed to fetch recent emails:', error);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(results, null, 2)
    };

  } catch (error) {
    console.error('Email system test failed:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Email system test failed',
        details: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};
