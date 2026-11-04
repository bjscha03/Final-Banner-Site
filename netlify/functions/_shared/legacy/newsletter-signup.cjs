const { neon } = require('@neondatabase/serverless');

// Neon database connection
const sql = neon(process.env.NETLIFY_DATABASE_URL);

exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { email, source } = JSON.parse(event.body || '{}');
    
    if (!email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Email is required' }),
      };
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid email format' }),
      };
    }

    console.log('Newsletter signup request for:', email);

    const sendPopupOffer = async () => {
      if (source !== 'site_popup') return;
      if (!process.env.RESEND_API_KEY) throw new Error('Email delivery unavailable');
      const { Resend } = require('resend');
      const raw = process.env.EMAIL_FROM || 'orders@bannersonthefly.com';
      const from = raw.includes('<') ? raw : `Banners on the Fly <${raw}>`;
      const result = await new Resend(process.env.RESEND_API_KEY).emails.send({
        from, to: email, subject: 'Your 20% first-order discount code',
        text: 'Your code is SAVE20 for 20% off your first order. Start designing: https://bannersonthefly.com/design?product=banner'
      });
      if (result.error || !result.data?.id) throw new Error('Email delivery failed');
    };
    // Create newsletter table if it doesn't exist
    await sql`
      CREATE TABLE IF NOT EXISTS newsletter (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text UNIQUE NOT NULL,
        subscribed boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;

    // Create index for email lookups
    await sql`CREATE INDEX IF NOT EXISTS idx_newsletter_email ON newsletter(email)`;

    // Check if email already exists
    const existingSubscription = await sql`
      SELECT id, subscribed FROM newsletter WHERE email = ${email}
    `;

    if (existingSubscription.length > 0) {
      const subscription = existingSubscription[0];
      
      if (subscription.subscribed) {
        await sendPopupOffer();
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            success: true, 
            message: 'You are already subscribed to our newsletter!',
            alreadySubscribed: true
          }),
        };
      } else {
        await sendPopupOffer();
        // Resubscribe
        await sql`
          UPDATE newsletter 
          SET subscribed = true, updated_at = now() 
          WHERE email = ${email}
        `;
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            success: true, 
            message: 'Welcome back! You have been resubscribed to our newsletter.',
            resubscribed: true
          }),
        };
      }
    }

    // Insert new subscription
    await sql`
      INSERT INTO newsletter (email, subscribed, created_at, updated_at)
      VALUES (${email}, true, now(), now())
    `;

    await sendPopupOffer();
    console.log(`Newsletter subscription successful for: ${email}`);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        message: 'Thank you for subscribing! You will receive exclusive offers and banner printing tips.',
        newSubscription: true
      }),
    };
  } catch (error) {
    console.error('Newsletter signup failed:', error);
    
    // Handle duplicate email error specifically
    if (error.message && error.message.includes('duplicate key')) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          message: 'You are already subscribed to our newsletter!',
          alreadySubscribed: true
        }),
      };
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to subscribe to newsletter', 
        details: error.message 
      }),
    };
  }
};

