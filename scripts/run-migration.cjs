#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

require('dotenv').config();

async function runMigration() {
  const { neon } = await import('@neondatabase/serverless');
  
  const DATABASE_URL = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL;
  
  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  // Check if URL has password
  const urlPattern = /postgresql:\/\/([^:]+):([^@]+)@/;
  const match = DATABASE_URL.match(urlPattern);
  
  if (!match || !match[2] || match[2] === '') {
    console.error('❌ DATABASE_URL is missing password');
    console.error('Format should be: postgresql://username:password@host/database');
    console.error('Please check your .env file and ensure the password is included');
    process.exit(1);
  }

  console.log('🔗 Connecting to Neon database...');
  console.log(`   Host: ${DATABASE_URL.split('@')[1]?.split('/')[0] || 'unknown'}`);
  
  const sql = neon(DATABASE_URL);

  const migrationPath = path.join(__dirname, '../database-migrations/001-events-system.sql');
  
  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Migration file not found: ${migrationPath}`);
    process.exit(1);
  }

  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
  
  console.log('📄 Migration file loaded');
  console.log('🚀 Running migration...\n');

  try {
    await sql(migrationSQL);
    
    console.log('\n✅ Migration completed successfully!');
    console.log('\n📊 Database schema updated:');
    console.log('   - event_categories table created (12 categories seeded)');
    console.log('   - events table created');
    console.log('   - Indexes created for performance');
    console.log('   - Triggers created for auto-timestamps');
    console.log('\n🎉 Events System v2 database is ready!');
    
  } catch (error) {
    console.error('\n❌ Migration failed:');
    console.error(error.message);
    
    if (error.message.includes('already exists')) {
      console.log('\n⚠️  Tables may already exist.');
    }
    
    process.exit(1);
  }
}

runMigration().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
