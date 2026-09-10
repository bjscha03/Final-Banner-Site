import { db } from './src/lib/supabase/client';
import { readFileSync } from 'fs';

async function runMigration() {
  try {
    if (!db) {
      console.error('❌ Database connection not available');
      console.error('Make sure VITE_DATABASE_URL is set in .env');
      process.exit(1);
    }

    console.log('📋 Reading migration file...');
    const migrationSql = readFileSync('./database-migrations/enhance-user-carts.sql', 'utf-8');

    console.log('🚀 Running migration...');
    
    // Execute the migration
    await db.unsafe(migrationSql);
    
    console.log('✅ Migration completed successfully!');
    
    // Verify the schema
    console.log('\n📋 Verifying schema...');
    const columns = await db`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'user_carts'
      ORDER BY ordinal_position
    `;
    
    console.log('\n📊 user_carts table structure:');
    console.table(columns);
    
    const indexes = await db`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'user_carts'
      ORDER BY indexname
    `;
    
    console.log('\n📊 Indexes:');
    console.table(indexes);
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
