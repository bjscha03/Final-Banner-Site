#!/usr/bin/env node
import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.VITE_DATABASE_URL || process.env.NETLIFY_DATABASE_URL;

console.log('🔧 FIXING user_carts TABLE FOR GUEST CARTS\n');

if (!DATABASE_URL) {
  console.error('❌ No database URL found');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

try {
  console.log('⏳ Connecting to database...');
  await sql`SELECT 1`;
  console.log('✅ Connected\n');
  
  console.log('🔧 Running migration steps...\n');
  
  // Step 1: Add session_id column
  try {
    await sql`ALTER TABLE user_carts ADD COLUMN IF NOT EXISTS session_id TEXT`;
    console.log('   ✅ Added session_id column');
  } catch (err) {
    console.log(`   ⏭️  session_id: ${err.message}`);
  }
  
  // Step 2: Add status column
  try {
    await sql`ALTER TABLE user_carts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'`;
    console.log('   ✅ Added status column');
  } catch (err) {
    console.log(`   ⏭️  status: ${err.message}`);
  }
  
  // Step 3: Add last_accessed_at column
  try {
    await sql`ALTER TABLE user_carts ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`;
    console.log('   ✅ Added last_accessed_at column');
  } catch (err) {
    console.log(`   ⏭️  last_accessed_at: ${err.message}`);
  }
  
  // Step 4: Drop old unique constraint
  try {
    await sql`ALTER TABLE user_carts DROP CONSTRAINT IF EXISTS user_carts_user_id_key`;
    console.log('   ✅ Dropped old unique constraint');
  } catch (err) {
    console.log(`   ⏭️  Drop constraint: ${err.message}`);
  }
  
  // Step 5: Make user_id nullable
  try {
    await sql`ALTER TABLE user_carts ALTER COLUMN user_id DROP NOT NULL`;
    console.log('   ✅ Made user_id nullable');
  } catch (err) {
    console.log(`   ⏭️  user_id nullable: ${err.message}`);
  }
  
  // Step 6: Add check constraint
  try {
    await sql`ALTER TABLE user_carts DROP CONSTRAINT IF EXISTS user_carts_id_check`;
    await sql`ALTER TABLE user_carts ADD CONSTRAINT user_carts_id_check CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)`;
    console.log('   ✅ Added check constraint');
  } catch (err) {
    console.log(`   ⏭️  Check constraint: ${err.message}`);
  }
  
  // Step 7: Create unique index for user carts
  try {
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS user_carts_user_id_active_unique ON user_carts(user_id) WHERE status = 'active' AND user_id IS NOT NULL`;
    console.log('   ✅ Created unique index for user carts');
  } catch (err) {
    console.log(`   ⏭️  User index: ${err.message}`);
  }
  
  // Step 8: Create unique index for guest carts
  try {
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS user_carts_session_id_active_unique ON user_carts(session_id) WHERE status = 'active' AND session_id IS NOT NULL`;
    console.log('   ✅ Created unique index for guest carts');
  } catch (err) {
    console.log(`   ⏭️  Guest index: ${err.message}`);
  }
  
  // Step 9: Create index on session_id
  try {
    await sql`CREATE INDEX IF NOT EXISTS idx_user_carts_session_id ON user_carts(session_id) WHERE session_id IS NOT NULL`;
    console.log('   ✅ Created session_id index');
  } catch (err) {
    console.log(`   ⏭️  Session index: ${err.message}`);
  }
  
  // Step 10: Create index on status
  try {
    await sql`CREATE INDEX IF NOT EXISTS idx_user_carts_status ON user_carts(status)`;
    console.log('   ✅ Created status index');
  } catch (err) {
    console.log(`   ⏭️  Status index: ${err.message}`);
  }
  
  console.log('\n✅ MIGRATION COMPLETE!\n');
  console.log('Verifying table structure...\n');
  
  const cols = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns 
    WHERE table_name = 'user_carts' 
    ORDER BY ordinal_position
  `;
  
  console.log('📊 user_carts columns:');
  cols.forEach(c => console.log(`   - ${c.column_name} (${c.data_type}) ${c.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`));
  
  const hasSessionId = cols.some(c => c.column_name === 'session_id');
  const userIdNullable = cols.find(c => c.column_name === 'user_id')?.is_nullable === 'YES';
  
  if (hasSessionId && userIdNullable) {
    console.log('\n🎉 SUCCESS! Guest cart support enabled!');
    console.log('   - user_id is now nullable');
    console.log('   - session_id column added');
    console.log('   - Guest carts can now be saved to database');
  } else {
    console.log('\n⚠️  WARNING: Migration may not be complete');
    console.log(`   - session_id exists: ${hasSessionId}`);
    console.log(`   - user_id nullable: ${userIdNullable}`);
  }
  
} catch (error) {
  console.error('\n❌ MIGRATION FAILED:', error.message);
  console.error(error);
  process.exit(1);
}
