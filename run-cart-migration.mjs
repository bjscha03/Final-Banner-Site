#!/usr/bin/env node

import postgres from 'postgres';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read database URL from .env
const envContent = readFileSync(join(__dirname, '.env'), 'utf-8');
const dbUrlMatch = envContent.match(/VITE_DATABASE_URL=(.+)/);

if (!dbUrlMatch) {
  console.error('❌ VITE_DATABASE_URL not found in .env');
  process.exit(1);
}

const databaseUrl = dbUrlMatch[1].trim();
console.log('🔗 Connecting to database...');

const sql = postgres(databaseUrl, {
  ssl: 'require',
  max: 1,
});

async function runMigration() {
  try {
    console.log('📋 Reading migration file...');
    const migrationSql = readFileSync(
      join(__dirname, 'database-migrations', 'enhance-user-carts.sql'),
      'utf-8'
    );

    console.log('🚀 Running migration...');
    
    // Split by semicolons and execute each statement
    const statements = migrationSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      if (statement.toLowerCase().includes('select')) {
        const result = await sql.unsafe(statement);
        console.log('📊 Query result:', result);
      } else {
        await sql.unsafe(statement);
        console.log('✅ Executed:', statement.substring(0, 60) + '...');
      }
    }

    console.log('✅ Migration completed successfully!');
    
    // Verify the schema
    console.log('\n📋 Verifying schema...');
    const columns = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'user_carts'
      ORDER BY ordinal_position
    `;
    
    console.log('\n📊 user_carts table structure:');
    console.table(columns);
    
    const indexes = await sql`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'user_carts'
      ORDER BY indexname
    `;
    
    console.log('\n📊 Indexes:');
    console.table(indexes);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runMigration();
