#!/usr/bin/env node
import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.VITE_DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
const sql = neon(DATABASE_URL);

console.log('🔍 Simulating exact frontend query...\n');

try {
  // This is EXACTLY what the frontend calls
  const orders = await sql`
    SELECT o.*,
           json_agg(
             json_build_object(
               'id', oi.id,
               'width_in', oi.width_in,
               'height_in', oi.height_in,
               'quantity', oi.quantity,
               'material', oi.material,
               'grommets', oi.grommets,
               'rope_feet', oi.rope_feet,
               'pole_pockets', oi.pole_pockets,
               'pole_pocket_size', oi.pole_pocket_size,
               'pole_pocket_position', oi.pole_pocket_position,
               'pole_pocket_cost_cents', oi.pole_pocket_cost_cents,
               'pole_pocket_pricing_mode', oi.pole_pocket_pricing_mode,
               'rope_cost_cents', oi.rope_cost_cents,
               'rope_pricing_mode', oi.rope_pricing_mode,
               'area_sqft', oi.width_in * oi.height_in / 144.0,
               'unit_price_cents', oi.unit_price_cents,
               'line_total_cents', oi.line_total_cents,
               'file_key', oi.file_key,
               'file_name', oi.file_name,
               'file_url', oi.file_url,
               'print_ready_url', oi.print_ready_url,
               'web_preview_url', oi.web_preview_url,
               'text_elements', oi.text_elements,
               'overlay_image', oi.overlay_image,
               'transform', oi.transform,
               'preview_canvas_px', oi.preview_canvas_px
             )
           ) as items
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    GROUP BY o.id
    ORDER BY o.created_at DESC
    LIMIT 1
  `;
  
  console.log('✅ Query executed successfully\n');
  console.log('Order ID:', orders[0].id);
  console.log('Order email:', orders[0].email);
  console.log('Items count:', orders[0].items.length);
  console.log('\nFirst item data:');
  console.log('  file_key:', orders[0].items[0].file_key);
  console.log('  overlay_image:', orders[0].items[0].overlay_image);
  
  if (orders[0].items[0].overlay_image) {
    console.log('\n✅ ✅ ✅ OVERLAY DATA IS PRESENT! ✅ ✅ ✅');
    console.log('The database query IS returning overlay data.');
    console.log('The issue MUST be in the frontend caching or rendering.');
  } else {
    console.log('\n❌ overlay_image is NULL');
  }
  
} catch (error) {
  console.error('❌ Error:', error.message);
}
