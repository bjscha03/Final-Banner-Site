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
    expect(customers).toContain('new URLSearchParams(customerFilterQueryString)');
  });

  it('drives All, New, and Repeat segmentation from the page URL', () => {
    expect(customers).toContain('useSearchParams()');
    expect(customers).toContain("const rawSegment = searchParams.get('segment')");
    expect(customers).toContain('resolveAdminCustomerSegment(rawSegment)');
    expect(customers).toContain('setSearchParams(withAdminCustomerSegment(searchParams, nextSegment))');
    expect(customers).toContain('segment,\n      period,');
    expect(customers).toContain('label="All customers"');
    expect(customers).toContain('label="New customers"');
    expect(customers).toContain('label="Repeat customers"');
    expect(customers).toContain('at least two completed orders');
  });

  it('exposes a confirmed, persistent, suppression-aware September deal send action', () => {
    expect(customers).toContain('Send Sept Deal');
    expect(customers).toContain('Send September 25% promotion?');
    expect(customers).toContain('/.netlify/functions/admin-send-september-promo');
    expect(customers).toContain("customer.septemberDealStatus === 'sent'");
    expect(customers).toContain('septemberDealSentAt');
    expect(customers).toContain('X-Idempotency-Key');
    expect(customers).toContain('Confirming will immediately send');
  });
});
