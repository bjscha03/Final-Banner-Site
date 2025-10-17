import { Handler } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';

export const handler: Handler = async (event) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const DATABASE_URL = process.env.VITE_DATABASE_URL;

  if (!DATABASE_URL) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Database URL not configured' }),
    };
  }

  const sql = neon(DATABASE_URL);
  const results: string[] = [];

  try {
    results.push('🔧 FIXING user_carts TABLE FOR GUEST CARTS');
    results.push('');

    // Test connection
    await sql`SELECT 1`;
    results.push('✅ Connected to database');
    results.push('');

    // Step 1: Add session_id column
    try {
      await sql`ALTER TABLE user_carts ADD COLUMN IF NOT EXISTS session_id TEXT`;
      results.push('✅ Added session_id column');
    } catch (err: any) {
      results.push(`⏭️  session_id: ${err.message}`);
    }

    // Step 2: Add status column
    try {
      await sql`ALTER TABLE user_carts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'`;
      results.push('✅ Added status column');
    } catch (err: any) {
      results.push(`⏭️  status: ${err.message}`);
    }

    // Step 3: Add last_accessed_at column
    try {
      await sql`ALTER TABLE user_carts ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`;
      results.push('✅ Added last_accessed_at column');
    } catch (err: any) {
      results.push(`⏭️  last_accessed_at: ${err.message}`);
    }

    // Step 4: Drop old unique constraint
    try {
      await sql`ALTER TABLE user_carts DROP CONSTRAINT IF EXISTS user_carts_user_id_key`;
      results.push('✅ Dropped old unique constraint');
    } catch (err: any) {
      results.push(`⏭️  Drop constraint: ${err.message}`);
    }

    // Step 5: Make user_id nullable
    try {
      await sql`ALTER TABLE user_carts ALTER COLUMN user_id DROP NOT NULL`;
      results.push('✅ Made user_id nullable');
    } catch (err: any) {
      results.push(`⏭️  user_id nullable: ${err.message}`);
    }

    // Step 6: Add check constraint
    try {
      await sql`ALTER TABLE user_carts DROP CONSTRAINT IF EXISTS user_carts_id_check`;
      await sql`ALTER TABLE user_carts ADD CONSTRAINT user_carts_id_check CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)`;
      results.push('✅ Added check constraint');
    } catch (err: any) {
      results.push(`⏭️  Check constraint: ${err.message}`);
    }

    // Step 7: Create unique index for user carts
    try {
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS user_carts_user_id_active_unique ON user_carts(user_id) WHERE status = 'active' AND user_id IS NOT NULL`;
      results.push('✅ Created unique index for user carts');
    } catch (err: any) {
      results.push(`⏭️  User index: ${err.message}`);
    }

    // Step 8: Create unique index for guest carts
    try {
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS user_carts_session_id_active_unique ON user_carts(session_id) WHERE status = 'active' AND session_id IS NOT NULL`;
      results.push('✅ Created unique index for guest carts');
    } catch (err: any) {
      results.push(`⏭️  Guest index: ${err.message}`);
    }

    // Step 9: Create index on session_id
    try {
      await sql`CREATE INDEX IF NOT EXISTS idx_user_carts_session_id ON user_carts(session_id) WHERE session_id IS NOT NULL`;
      results.push('✅ Created session_id index');
    } catch (err: any) {
      results.push(`⏭️  Session index: ${err.message}`);
    }

    // Step 10: Create index on status
    try {
      await sql`CREATE INDEX IF NOT EXISTS idx_user_carts_status ON user_carts(status)`;
      results.push('✅ Created status index');
    } catch (err: any) {
      results.push(`⏭️  Status index: ${err.message}`);
    }

    results.push('');
    results.push('✅ MIGRATION COMPLETE!');
    results.push('');

    // Verify table structure
    const cols = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'user_carts' 
      ORDER BY ordinal_position
    `;

    results.push('📊 user_carts columns:');
    cols.forEach((c: any) => {
      results.push(`   - ${c.column_name} (${c.data_type}) ${c.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });

    const hasSessionId = cols.some((c: any) => c.column_name === 'session_id');
    const userIdNullable = cols.find((c: any) => c.column_name === 'user_id')?.is_nullable === 'YES';

    results.push('');
    if (hasSessionId && userIdNullable) {
      results.push('🎉 SUCCESS! Guest cart support enabled!');
      results.push('   - user_id is now nullable');
      results.push('   - session_id column added');
      results.push('   - Guest carts can now be saved to database');
    } else {
      results.push('⚠️  WARNING: Migration may not be complete');
      results.push(`   - session_id exists: ${hasSessionId}`);
      results.push(`   - user_id nullable: ${userIdNullable}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: results.join('\n'),
        hasSessionId,
        userIdNullable,
      }),
    };
  } catch (error: any) {
    results.push('');
    results.push(`❌ MIGRATION FAILED: ${error.message}`);

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
        message: results.join('\n'),
      }),
    };
  }
};
