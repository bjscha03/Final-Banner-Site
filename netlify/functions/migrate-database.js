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
    console.log('Starting database migration: Add username to profiles');

    // Check if username column already exists
    const columnCheck = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'profiles' AND column_name = 'username'
    `;

    if (columnCheck.length > 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          message: 'Username column already exists',
          status: 'already_migrated'
        }),
      };
    }

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

    console.log('Migration completed successfully');
    console.log('Updated profiles table schema:', verification);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Database migration completed successfully',
        status: 'migrated',
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
