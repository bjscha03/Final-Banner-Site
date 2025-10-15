#!/usr/bin/env node
import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.VITE_DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
const sql = neon(DATABASE_URL);

console.log('🔍 Testing listAll() query...\n');

try {
  const orders = await sql`
    SELECT o.*,
           json_agg(
             json_build_object(
               'id', oi.id,
               'overlay_image', oi.overlay_image
             )
           ) as items
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    GROUP BY o.id
    ORDER BY o.created_at DESC
    LIMIT 1
  `;
  
  console.log('📊 Most recent order:');
  console.log('  Order ID:', orders[0].id);
  console.log('  Items:', orders[0].items);
  console.log('\n  First item overlay_image:', orders[0].items[0].overlay_image);
  
  if (orders[0].items[0].overlay_image) {
    console.log('\n✅ overlay_image IS being returned by the query!');
    console.log('   The issue is in the frontend - probably caching');
  } else {
    console.log('\n❌ overlay_image is NULL in the query result');
  }
  
} catch (error) {
  console.error('❌ Error:', error.message);
}
