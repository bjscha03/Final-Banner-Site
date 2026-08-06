const { neon } = require('@neondatabase/serverless');
async function checkOrder() {
  const databaseUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('Set NETLIFY_DATABASE_URL or DATABASE_URL before running this diagnostic.');
  }
  const sql = neon(databaseUrl);
  const orders = await sql`SELECT id, order_number, subtotal_cents, total_cents FROM orders ORDER BY created_at DESC LIMIT 5`;
  console.log('Recent orders:', orders);
  if (orders.length > 0) {
    const items = await sql`SELECT width_in, height_in, material, file_key FROM order_items WHERE order_id = ${orders[0].id}`;
    console.log('Items:', items);
  }
}
checkOrder().catch(console.error);
