#!/usr/bin/env node
import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.VITE_DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
const sql = neon(DATABASE_URL);

const orderId = '49e421d8-fca1-452c-b426-8744220826b3';

console.log('🔍 Checking order overlay data...\n');

try {
  const items = await sql`
    SELECT id, overlay_image, text_elements, created_at
    FROM order_items 
    WHERE order_id = ${orderId}
  `;
  
  console.log('📊 Order items found:', items.length);
  
  items.forEach((item, i) => {
    console.log(`\nItem ${i + 1}:`);
    console.log('  Created:', item.created_at);
    console.log('  overlay_image:', item.overlay_image);
    console.log('  text_elements:', item.text_elements);
  });
  
  if (items.length > 0 && !items[0].overlay_image) {
    console.log('\n❌ This order has NO overlay_image data');
    console.log('   This order was created BEFORE the database fix');
    console.log('   You need to create a NEW order to test the fix');
  } else if (items.length > 0 && items[0].overlay_image) {
    console.log('\n✅ This order HAS overlay_image data!');
    console.log('   The database fix is working');
    console.log('   The issue must be in the PDF rendering code');
  }
  
} catch (error) {
  console.error('❌ Error:', error.message);
}
