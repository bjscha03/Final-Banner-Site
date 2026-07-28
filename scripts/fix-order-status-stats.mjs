import fs from 'node:fs';

const path = 'src/pages/admin/Orders.tsx';
let source = fs.readFileSync(path, 'utf8');

const replacements = [
  [
    "      shippedOrders: allOrders.filter((o) => o.tracking_number).length,",
    "      shippedOrders: allOrders.filter((o) => o.status === 'shipped').length,",
  ],
  [
    "      pendingOrders: allOrders.filter((o) => !o.tracking_number && o.status !== 'in_production').length,",
    "      pendingOrders: allOrders.filter((o) => o.status === 'pending').length,",
  ],
  [
    "                    {orders.filter(o => o.tracking_number).length}",
    "                    {orders.filter(o => o.status === 'shipped').length}",
  ],
  [
    "                    {orders.filter(o => !o.tracking_number && o.status !== 'in_production').length}",
    "                    {orders.filter(o => o.status === 'pending').length}",
  ],
];

for (const [before, after] of replacements) {
  if (source.includes(after)) continue;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`Expected one status-counter target, found ${count}: ${before}`);
  source = source.replace(before, after);
}

fs.writeFileSync(path, source);
console.log('Aligned Admin status counters with actual workflow status.');
