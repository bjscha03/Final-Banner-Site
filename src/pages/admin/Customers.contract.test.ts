import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const customers = readFileSync(fileURLToPath(new URL('./Customers.tsx', import.meta.url)), 'utf8');

describe('admin customer bounded-data contract', () => {
  it('guards list state against stale filter and page responses', () => {
    expect(customers).toContain('const listRequestId = useRef(0)');
    expect(customers).toContain('const requestId = ++listRequestId.current');
    expect(customers).toContain('if (requestId !== listRequestId.current) return;');
    expect(customers).toContain('if (requestId === listRequestId.current) setLoading(false)');
    expect(customers).toContain('return () => { listRequestId.current += 1; };');
  });

  it('loads customer history separately and exposes bounded paging controls', () => {
    expect(customers).toContain("mode: 'detail'");
    expect(customers).toContain("order_page_size: '50'");
    expect(customers).toContain('detailOrders.map((order) =>');
    expect(customers).not.toContain('selectedCustomer.orders');
    expect(customers).toContain('Load more orders');
    expect(customers).toContain('pagination.hasPrevious');
    expect(customers).toContain('pagination.hasNext');
  });

  it('uses bounded export pages and final suppression verification', () => {
    expect(customers).toContain("params.set('page_size', '250')");
    expect(customers).toContain("mode=verify_export");
    expect(customers).toContain('buildCustomerCsv(verifiedRecords, { marketingOnly: true })');
  });
});
