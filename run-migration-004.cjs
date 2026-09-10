const fs = require('fs');
const { neon } = require('@neondatabase/serverless');

async function runMigration() {
  // Read DATABASE_URL from .env file
  const envContent = fs.readFileSync('.env', 'utf8');
  const dbUrlMatch = envContent.match(/^NETLIFY_DATABASE_URL=(.+)$/m);
  
  if (!dbUrlMatch) {
    console.error('❌ NETLIFY_DATABASE_URL not found in .env');
    process.exit(1);
  }
  
  const DATABASE_URL = dbUrlMatch[1].trim();
  console.log('✓ Found database URL');
  
  const sql = neon(DATABASE_URL);
  console.log('✓ Connected to database');
  
  // Read migration file
  const migrationSQL = fs.readFileSync('migrations/004_abandoned_cart_system.sql', 'utf8');
  console.log('✓ Loaded migration file');
  
  try {
    // Execute the entire migration as one query
    await sql(migrationSQL);
    console.log('✓ Migration executed successfully!');
    
    // Verify tables were created
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('abandoned_carts', 'cart_recovery_logs', 'discount_codes')
      ORDER BY table_name
    `;
    
    console.log('\n✓ Tables created:');
    tables.forEach(t => console.log(`  - ${t.table_name}`));
    
    console.log('\n🎉 Migration 004 completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
