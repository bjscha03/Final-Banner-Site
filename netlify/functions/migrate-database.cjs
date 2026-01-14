const { neon } = require('@neondatabase/serverless');

// Neon database connection
const sql = neon(process.env.NETLIFY_DATABASE_URL);

exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    console.log('Starting database migration: Email system tables');
    const results = [];

    // Skip username check - run all migrations

    // 1. Create password_resets table
    console.log('Creating password_resets table...');
    await sql`
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
    await sql`CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_password_resets_expires_at ON password_resets(expires_at)`;
    results.push('password_resets indexes created');

    // 2. Add order email tracking fields
    console.log('Adding order email tracking fields...');
    await sql`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS confirmation_email_status text,
        ADD COLUMN IF NOT EXISTS confirmation_emailed_at timestamptz
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_orders_confirmation_email_status ON orders(confirmation_email_status)`;
    results.push('order email tracking fields added');

    // 3. Create email_events table
    console.log('Creating email_events table...');
    await sql`
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
    await sql`CREATE INDEX IF NOT EXISTS idx_email_events_type ON email_events(type)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_email_events_status ON email_events(status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_email_events_order_id ON email_events(order_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_email_events_created_at ON email_events(created_at)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_email_events_provider_msg_id ON email_events(provider_msg_id)`;
    results.push('email_events indexes created');

    // 4. Add password_hash column to profiles
    console.log('Adding password_hash column to profiles...');
    await sql`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash text`;
    results.push('password_hash column added to profiles');

    // 5. Create email_verifications table
    console.log('Creating email_verifications table...');
    await sql`
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
    await sql`CREATE INDEX IF NOT EXISTS idx_email_verifications_token ON email_verifications(token)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id ON email_verifications(user_id)`;
    results.push('email_verifications table created');

    // 6. Add email verification fields to profiles
    console.log('Adding email verification fields to profiles...');
    await sql`
      ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP WITH TIME ZONE
    `;
    results.push('email verification fields added to profiles');

    // 7. Add username column if it doesn't exist (original migration)
    console.log('Adding username column to profiles...');
    await sql`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username text`;
    results.push('username column added to profiles');

    // 8. Clean up expired password reset tokens
    console.log('Cleaning up expired tokens...');
    await sql`DELETE FROM password_resets WHERE expires_at < NOW() AND used = false`;
    results.push('cleaned up expired tokens');

    // 9. Update existing orders with default email status
    console.log('Updating existing orders...');
    await sql`UPDATE orders SET confirmation_email_status = 'unknown' WHERE confirmation_email_status IS NULL`;
    results.push('updated existing orders with default email status');

    // Add username column
    await sql`
      ALTER TABLE profiles 
      ADD COLUMN username VARCHAR(50) UNIQUE
    `;

    // Create index for faster username lookups
    await sql`
      CREATE INDEX idx_profiles_username ON profiles(username)
    `;

    // Add constraint to ensure username is not empty when provided
    await sql`
      ALTER TABLE profiles 
      ADD CONSTRAINT chk_username_not_empty 
      CHECK (username IS NULL OR LENGTH(TRIM(username)) > 0)
    `;

    // 7. Add thumbnail_url column to order_items table
    console.log('Adding thumbnail_url column to order_items...');
    try {
      await sql`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS thumbnail_url text`;
      results.push('thumbnail_url column added to order_items');
    } catch (thumbErr) {
      console.log('thumbnail_url column may already exist:', thumbErr.message);
      results.push('thumbnail_url column already exists');
    }

    // Add constraint for username format (alphanumeric + underscore/dash)
    await sql`
      ALTER TABLE profiles 
      ADD CONSTRAINT chk_username_format 
      CHECK (username IS NULL OR username ~ '^[a-zA-Z0-9_-]+$')
    `;

    // Verify the changes
    const verification = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'profiles' 
      ORDER BY ordinal_position
    `;

    console.log('Email system database migrations completed successfully');
    console.log('Updated profiles table schema:', verification);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Email system database migrations completed successfully',
        status: 'migrated',
        results: results,
        schema: verification
      }),
    };

  } catch (error) {
    console.error('Migration error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Migration failed',
        details: error.message
      }),
    };
  }
};
