#!/usr/bin/env node
import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.VITE_DATABASE_URL || process.env.NETLIFY_DATABASE_URL;

console.log('🔧 RUNNING DATABASE MIGRATION\n');

if (!DATABASE_URL) {
  console.error('❌ No database URL found');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

const columns = [
  { name: 'pole_pockets', type: 'VARCHAR(50)', default: "'none'" },
  { name: 'pole_pocket_size', type: 'VARCHAR(50)', default: null },
  { name: 'pole_pocket_position', type: 'VARCHAR(50)', default: null },
  { name: 'pole_pocket_cost_cents', type: 'INTEGER', default: '0' },
  { name: 'pole_pocket_pricing_mode', type: 'VARCHAR(20)', default: "'per_item'" },
  { name: 'rope_cost_cents', type: 'INTEGER', default: '0' },
  { name: 'rope_pricing_mode', type: 'VARCHAR(20)', default: "'per_item'" },
  { name: 'area_sqft', type: 'NUMERIC(10,2)', default: '0' },
  { name: 'unit_price_cents', type: 'INTEGER', default: '0' },
  { name: 'file_key', type: 'VARCHAR(255)', default: null },
  { name: 'file_name', type: 'VARCHAR(255)', default: null },
  { name: 'file_url', type: 'TEXT', default: null },
  { name: 'print_ready_url', type: 'TEXT', default: null },
  { name: 'web_preview_url', type: 'TEXT', default: null },
  { name: 'text_elements', type: 'JSONB', default: null },
  { name: 'overlay_image', type: 'JSONB', default: null },
  { name: 'transform', type: 'JSONB', default: null },
  { name: 'preview_canvas_px', type: 'JSONB', default: null },
];

try {
  console.log('⏳ Connecting to database...');
  await sql`SELECT 1`;
  console.log('✅ Connected\n');
  
  console.log('🔧 Adding missing columns...\n');
  
  for (const col of columns) {
    try {
      const defaultClause = col.default ? `DEFAULT ${col.default}` : '';
      const query = `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS ${col.name} ${col.type} ${defaultClause}`;
      
      await sql([query]);
      console.log(`   ✅ ${col.name}`);
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log(`   ⏭️  ${col.name} (already exists)`);
      } else {
        console.error(`   ❌ ${col.name}: ${err.message}`);
      }
    }
  }
  
  console.log('\n✅ MIGRATION COMPLETE!\n');
  console.log('Verifying columns...\n');
  
  const cols = await sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'order_items' 
    ORDER BY ordinal_position
  `;
  
  console.log('📊 order_items columns:');
  cols.forEach(c => console.log(`   - ${c.column_name} (${c.data_type})`));
  
  const hasOverlay = cols.some(c => c.column_name === 'overlay_image');
  
  if (hasOverlay) {
    console.log('\n🎉 SUCCESS! overlay_image column exists!');
    console.log('   Overlay images will now be saved to the database.');
  } else {
    console.log('\n⚠️  WARNING: overlay_image column not found!');
  }
  
} catch (error) {
  console.error('\n❌ MIGRATION FAILED:', error.message);
  console.error(error);
  process.exit(1);
}
