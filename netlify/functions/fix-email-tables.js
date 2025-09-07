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
    console.log('Fixing email system tables...');
    const results = [];

    // Drop existing email tables if they exist (to fix structure issues)
    console.log('Dropping existing email tables...');
    await sql`DROP TABLE IF EXISTS email_events CASCADE`;
    await sql`DROP TABLE IF EXISTS email_verifications CASCADE`;
    await sql`DROP TABLE IF EXISTS password_resets CASCADE`;
    results.push('Dropped existing email tables');

    // 1. Create password_resets table
    console.log('Creating password_resets table...');
    await sql`
      CREATE TABLE password_resets (
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
    await sql`CREATE INDEX idx_password_resets_user_id ON password_resets(user_id)`;
    await sql`CREATE INDEX idx_password_resets_token ON password_resets(token)`;
    await sql`CREATE INDEX idx_password_resets_expires_at ON password_resets(expires_at)`;
    results.push('password_resets indexes created');

    // 2. Create email_events table
    console.log('Creating email_events table...');
    await sql`
      CREATE TABLE email_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        type text NOT NULL,
        to_email text NOT NULL,
        provider_msg_id text,
        status text NOT NULL,
        error_message text,
        order_id text,
        user_id uuid,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    results.push('email_events table created');

    // Create indexes for email_events
    await sql`CREATE INDEX idx_email_events_type ON email_events(type)`;
    await sql`CREATE INDEX idx_email_events_status ON email_events(status)`;
    await sql`CREATE INDEX idx_email_events_order_id ON email_events(order_id)`;
    await sql`CREATE INDEX idx_email_events_created_at ON email_events(created_at)`;
    await sql`CREATE INDEX idx_email_events_provider_msg_id ON email_events(provider_msg_id)`;
    results.push('email_events indexes created');

    // 3. Create email_verifications table
    console.log('Creating email_verifications table...');
    await sql`
      CREATE TABLE email_verifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid UNIQUE NOT NULL,
        token text UNIQUE NOT NULL,
        expires_at timestamptz NOT NULL,
        verified boolean NOT NULL DEFAULT false,
        verified_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT fk_email_verifications_user_id
          FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
      )
    `;
    results.push('email_verifications table created');

    // Create indexes for email_verifications
    await sql`CREATE INDEX idx_email_verifications_user_id ON email_verifications(user_id)`;
    await sql`CREATE INDEX idx_email_verifications_token ON email_verifications(token)`;
    await sql`CREATE INDEX idx_email_verifications_expires_at ON email_verifications(expires_at)`;
    results.push('email_verifications indexes created');

    // 4. Add email-related columns to profiles table if they don't exist
    console.log('Adding email columns to profiles table...');
    
    try {
      await sql`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash text`;
      await sql`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false`;
      await sql`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_verified_at timestamptz`;
      results.push('Added email columns to profiles table');
    } catch (error) {
      console.log('Email columns may already exist:', error.message);
      results.push('Email columns already exist in profiles table');
    }

    // 5. Add email-related columns to orders table if they don't exist
    console.log('Adding email columns to orders table...');
    
    try {
      await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_email_status text`;
      await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_emailed_at timestamptz`;
      results.push('Added email columns to orders table');
    } catch (error) {
      console.log('Email columns may already exist in orders:', error.message);
      results.push('Email columns already exist in orders table');
    }

    console.log('Email system tables fixed successfully');
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        message: 'Email system tables fixed successfully',
        results 
      }),
    };
  } catch (error) {
    console.error('Failed to fix email tables:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to fix email tables', 
        details: error.message 
      }),
    };
  }
};
