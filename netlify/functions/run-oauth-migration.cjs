const { neon } = require('@neondatabase/serverless');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
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
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Database not configured' })
      };
    }

    console.log('🔵 Starting OAuth columns migration...');
    const sql = neon(dbUrl);

    // Add google_id column for Google OAuth
    console.log('🔵 Adding google_id column...');
    await sql`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS google_id VARCHAR(255)`;
    
    // Add linkedin_id column for LinkedIn OAuth
    console.log('🔵 Adding linkedin_id column...');
    await sql`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS linkedin_id VARCHAR(255)`;
    
    // Add password_hash column for email/password authentication
    console.log('🔵 Adding password_hash column...');
    await sql`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash TEXT`;

    // Create unique constraints (drop first if exists to avoid errors)
    console.log('🔵 Creating unique constraints...');
    await sql`ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_google_id_key`;
    await sql`ALTER TABLE profiles ADD CONSTRAINT profiles_google_id_key UNIQUE (google_id)`;
    
    await sql`ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_linkedin_id_key`;
    await sql`ALTER TABLE profiles ADD CONSTRAINT profiles_linkedin_id_key UNIQUE (linkedin_id)`;

    // Create indexes for faster OAuth lookups
    console.log('🔵 Creating indexes...');
    await sql`CREATE INDEX IF NOT EXISTS idx_profiles_google_id ON profiles(google_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_profiles_linkedin_id ON profiles(linkedin_id)`;

    // Verify the migration
    console.log('🔵 Verifying migration...');
    const verification = await sql`
      SELECT 
        column_name, 
        data_type, 
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name = 'profiles'
      AND column_name IN ('google_id', 'linkedin_id', 'password_hash')
      ORDER BY column_name
    `;

    console.log('✅ Migration completed successfully!');
    console.log('✅ Columns added:', verification);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'OAuth columns migration completed successfully',
        columnsAdded: verification.map(col => col.column_name),
        details: verification
      })
    };

  } catch (error) {
    console.error('❌ Migration error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack
      })
    };
  }
};
