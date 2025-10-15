#!/usr/bin/env node
import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.VITE_DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
const sql = neon(DATABASE_URL);

const orderId = '49e421d8-fca1-452c-b426-8744220826b3';

console.log('🔍 Checking order user_id...\n');

try {
  const order = await sql`
    SELECT id, user_id, email, created_at
    FROM orders 
    WHERE id = ${orderId}
  `;
  
  console.log('Order details:');
  console.log('  ID:', order[0].id);
  console.log('  user_id:', order[0].user_id);
  console.log('  email:', order[0].email);
  console.log('  created_at:', order[0].created_at);
  
  // Check if this is an admin user
  const adminCheck = await sql`
    SELECT id, email, role FROM profiles WHERE id = ${order[0].user_id}
  `;
  
  if (adminCheck.length > 0) {
    console.log('\nUser profile:');
    console.log('  email:', adminCheck[0].email);
    console.log('  role:', adminCheck[0].role);
  } else {
    console.log('\n⚠️  No profile found for this user_id');
  }
  
  // Check what listAll returns
  console.log('\n🔍 Testing listAll query (admin view)...');
  const allOrders = await sql`
    SELECT o.id, o.email, o.user_id,
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
    LIMIT 3
  `;
  
  console.log('\nRecent orders from listAll:');
  allOrders.forEach((o, i) => {
    console.log(`\n${i + 1}. Order ${o.id.substring(0, 8)}...`);
    console.log('   email:', o.email);
    console.log('   has overlay:', !!o.items[0]?.overlay_image);
  });
  
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error);
}
