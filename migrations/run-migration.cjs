const fs = require('fs');
const path = require('path');

async function runMigration(filename) {
  const databaseUrl = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL or NETLIFY_DATABASE_URL environment variable not set');
    process.exit(1);
  }

  console.log('✓ Found database URL');

  let neon;
  try {
    neon = require('@neondatabase/serverless');
  } catch (error) {
    console.error('❌ Failed to import @neondatabase/serverless');
    console.error('   Run: npm install @neondatabase/serverless');
    process.exit(1);
  }

  const { neon: sql } = neon;
  const db = sql(databaseUrl);

  console.log('✓ Connected to database');

  const migrationPath = path.join(__dirname, filename);
  
  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Migration file not found: ${migrationPath}`);
    process.exit(1);
  }

  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
  console.log(`✓ Running migration: ${filename}`);

  try {
    // Remove comments and split by semicolons that end statements
    const cleanSQL = migrationSQL
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');
    
    const statements = cleanSQL
      .split(');')
      .map((s, i, arr) => i < arr.length - 1 ? s + ')' : s)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    console.log(`✓ Executing ${statements.length} SQL statements...`);
    
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (stmt && stmt.length > 5) {
        try {
          await db(stmt);
          console.log(`  ✓ Statement ${i + 1}/${statements.length}`);
        } catch (err) {
          if (!err.message.includes('already exists')) {
            console.error(`❌ Error in statement ${i + 1}:`, err.message);
            console.error(`   Statement: ${stmt.substring(0, 150)}...`);
            throw err;
          } else {
            console.log(`  ⚠️  Statement ${i + 1}/${statements.length} (already exists)`);
          }
        }
      }
    }
    
    console.log('\n✓ Migration completed successfully');
    
    const tables = await db`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'user_credits', 'generations', 'selections', 'usage_log')
      ORDER BY table_name
    `;
    
    console.log('\n✓ Tables created:');
    tables.forEach(t => console.log(`  - ${t.table_name}`));
    
    if (tables.length === 5) {
      console.log('\n🎉 All 5 tables created successfully!');
    } else {
      console.log(`\n⚠️  Warning: Expected 5 tables, found ${tables.length}`);
    }
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
}

const filename = process.argv[2];

if (!filename) {
  console.error('Usage: node run-migration.cjs <migration-file.sql>');
  console.error('Example: node run-migration.cjs 001_ai_generation_system.sql');
  process.exit(1);
}

runMigration(filename);
