const { neon } = require('@neondatabase/serverless');
async function checkOrder() {
  const sql = neon('postgresql://neondb_owner:npg_PILZHoBXt23D@ep-delicate-sea-aebekqeo-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require');
  const orders = await sql`SELECT id, order_number, subtotal_cents, total_cents FROM orders ORDER BY created_at DESC LIMIT 5`;
  console.log('Recent orders:', orders);
  if (orders.length > 0) {
    const items = await sql`SELECT width_in, height_in, material, file_key FROM order_items WHERE order_id = ${orders[0].id}`;
    console.log('Items:', items);
  }
}
checkOrder().catch(console.error);
