#!/usr/bin/env node

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use the existing db connection from the project
const { db } = await import('./src/lib/supabase/client.js');

async function runMigration() {
  try {
    if (!db) {
      console.error('❌ Database connection not available');
      process.exit(1);
    }

    console.log('📋 Reading migration file...');
    const migrationSql = readFileSync(
      join(__dirname, 'database-migrations', 'enhance-user-carts.sql'),
      'utf-8'
    );

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
    
    console.log('\n�� Indexes:');
    console.table(indexes);
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
