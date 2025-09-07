const { neon } = require('@neondatabase/serverless');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
      console.error('Database URL not configured');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ ok: false, error: 'Database not configured' })
      };
    }

    const db = neon(dbUrl);
    const results = [];

    // 1. Create password_resets table
    console.log('Creating password_resets table...');
    await db`
      CREATE TABLE IF NOT EXISTS password_resets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        token text UNIQUE NOT NULL,
        expires_at timestamptz NOT NULL,
        used boolean NOT NULL DEFAULT false,
        used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        
        CONSTRAINT fk_password_resets_user_id 
          FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
      )
    `;
    results.push('password_resets table created');

    // Create indexes for password_resets
    await db`CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token)`;
    await db`CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id)`;
    await db`CREATE INDEX IF NOT EXISTS idx_password_resets_expires_at ON password_resets(expires_at)`;
    results.push('password_resets indexes created');

    // 2. Add order email tracking fields
    console.log('Adding order email tracking fields...');
    await db`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS confirmation_email_status text,
        ADD COLUMN IF NOT EXISTS confirmation_emailed_at timestamptz
    `;
    await db`CREATE INDEX IF NOT EXISTS idx_orders_confirmation_email_status ON orders(confirmation_email_status)`;
    results.push('order email tracking fields added');

    // 3. Create email_events table
    console.log('Creating email_events table...');
    await db`
      CREATE TABLE IF NOT EXISTS email_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        type text NOT NULL,
        to_email text NOT NULL,
        provider_msg_id text,
        status text NOT NULL,
        error_message text,
        order_id text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    results.push('email_events table created');

    // Create indexes for email_events
    await db`CREATE INDEX IF NOT EXISTS idx_email_events_type ON email_events(type)`;
    await db`CREATE INDEX IF NOT EXISTS idx_email_events_status ON email_events(status)`;
    await db`CREATE INDEX IF NOT EXISTS idx_email_events_order_id ON email_events(order_id)`;
    await db`CREATE INDEX IF NOT EXISTS idx_email_events_created_at ON email_events(created_at)`;
    await db`CREATE INDEX IF NOT EXISTS idx_email_events_provider_msg_id ON email_events(provider_msg_id)`;
    results.push('email_events indexes created');

    // 4. Add password_hash column to profiles
    console.log('Adding password_hash column to profiles...');
    await db`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash text`;
    results.push('password_hash column added to profiles');

    // 5. Create email_verifications table
    console.log('Creating email_verifications table...');
    await db`
      CREATE TABLE IF NOT EXISTS email_verifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        token VARCHAR(128) NOT NULL UNIQUE,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        verified BOOLEAN DEFAULT FALSE,
        verified_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(user_id)
      )
    `;
    await db`CREATE INDEX IF NOT EXISTS idx_email_verifications_token ON email_verifications(token)`;
    await db`CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id ON email_verifications(user_id)`;
    results.push('email_verifications table created');

    // 6. Add email verification fields to profiles
    console.log('Adding email verification fields to profiles...');
    await db`
      ALTER TABLE profiles 
      ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP WITH TIME ZONE
    `;
    results.push('email verification fields added to profiles');

    // 7. Clean up expired password reset tokens
    console.log('Cleaning up expired tokens...');
    const cleanupResult = await db`DELETE FROM password_resets WHERE expires_at < NOW() AND used = false`;
    results.push(`cleaned up expired tokens`);

    // 8. Update existing orders with default email status
    console.log('Updating existing orders...');
    await db`UPDATE orders SET confirmation_email_status = 'unknown' WHERE confirmation_email_status IS NULL`;
    results.push('updated existing orders with default email status');

    console.log('Database migrations completed successfully');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        ok: true, 
        message: 'Database migrations completed successfully',
        results
      })
    };

  } catch (error) {
    console.error('Database migration failed:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        ok: false, 
        error: 'Database migration failed',
        details: error.message
      })
    };
  }
};
