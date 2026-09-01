import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const orders = readFileSync(fileURLToPath(new URL('./Orders.tsx', import.meta.url)), 'utf8');
const trackingManager = readFileSync(fileURLToPath(new URL('../../components/orders/AdminTrackingManager.tsx', import.meta.url)), 'utf8');
const orderClient = readFileSync(fileURLToPath(new URL('../../lib/orders/netlify-function.ts', import.meta.url)), 'utf8');

const indexesOf = (source: string, value: string): number[] => Array.from(source.matchAll(new RegExp(value, 'g')), (match) => match.index);

const componentSource = (startMarker: string, endMarker?: string): string => {
  const start = orders.indexOf(startMarker);
  const end = endMarker ? orders.indexOf(endMarker, start + startMarker.length) : orders.length;
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return orders.slice(start, end);
};

describe('admin orders reporting and action hierarchy', () => {
  it('keeps tracking before files and actions in desktop and mobile order cards', () => {
    const trackingIndexes = indexesOf(orders, 'data-admin-tracking-group');
    const fileIndexes = indexesOf(orders, 'data-admin-file-group');
    const actionIndexes = indexesOf(orders, 'data-admin-action-group');

    expect(trackingIndexes).toHaveLength(2);
    expect(fileIndexes).toHaveLength(2);
    expect(actionIndexes).toHaveLength(2);
    trackingIndexes.forEach((trackingIndex, index) => {
      expect(trackingIndex).toBeLessThan(fileIndexes[index]);
      expect(fileIndexes[index]).toBeLessThan(actionIndexes[index]);
    });
  });

  it('owns send and resend tracking controls inside the shared tracking card', () => {
    expect(trackingManager).toContain("notificationSent ? 'Resend Tracking Info' : 'Send Tracking Info'");
    expect(trackingManager).toContain("order.status === 'refunded'");
    expect(orders).not.toContain('Send Tracking Email');
    expect(orders).not.toContain('resend-tracking-email');
  });

  it('gives desktop and mobile tracking managers unique accessible heading IDs', () => {
    expect(orders).toContain('instanceSuffix="desktop"');
    expect(orders).toContain('instanceSuffix="mobile"');
    expect(trackingManager).toContain('instanceSuffix?: string');
    expect(trackingManager).toContain("instanceSuffix ? `-${instanceSuffix}` : ''");
  });

  it('offers each requested reporting period and metric', () => {
    expect(orders).toContain("['this_month', 'last_month', 'custom', 'all_time']");
    expect(orders).toContain("useState<AdminOrderPeriod>('all_time')");
    for (const label of ['Total Orders', 'Gross Sales', 'AOV', 'Recorded Refunds', 'Net Sales', 'New Customers', 'Repeat Customers', 'Repeat Rate']) {
      expect(orders).toContain(`label: '${label}'`);
    }
    expect(orders).toContain('Search order ID, customer name, or email');
    expect(orders).toContain('View all orders');
    expect(orders).toContain('outside this period.');
  });

  it('uses a server-bounded report instead of loading full rich order history in the browser', () => {
    expect(orders).toContain('fetchAdminOrdersReport');
    expect(orders).toContain('pageSize: PAGE_SIZE');
    expect(orders).toContain('pagination.totalItems');
    expect(orders).toContain('getAdminOrderPeriodBounds');
    expect(orders).toContain('start?.toISOString()');
    expect(orders).toContain('endExclusive?.toISOString()');
    expect(orders).not.toContain('history_scan=1');
    expect(orders).not.toContain('loadAllOrdersForOverview');
    expect(orders).not.toContain('listAll(');
    expect(orders).not.toContain('pageToLoad > 5000');
    expect(orderClient).toContain("admin_report: '1'");
    expect(orderClient).toContain('Math.min(20');
  });

  it('debounces search and prevents an older report response from replacing current controls', () => {
    expect(orders).toContain('window.setTimeout');
    expect(orders).toContain('}, 250)');
    expect(orders).toContain('reportAbortController.current?.abort()');
    expect(orders).toContain('const requestId = ++reportRequestId.current');
    expect(orders).toContain('controller.signal.aborted || requestId !== reportRequestId.current');
    expect(orders).toContain('requestId !== reportRequestId.current');
    expect(orderClient).toContain('signal: options.signal');
  });

  it('cancels lazy detail work and fences duplicate or stale per-order responses', () => {
    expect(orders).toContain('useRef<Map<string, AbortController>>(new Map())');
    expect(orders).toContain('useRef<Map<string, number>>(new Map())');
    expect(orders).toContain('detailAbortControllers.current.forEach((controller) => controller.abort())');
    expect(orders).toContain('if (detailAbortControllers.current.has(orderId)) return');
    expect(orders).toContain('detailRequestIds.current.set(orderId, requestId)');
    expect(orders).toContain('fetchAdminOrderDetail(orderId, { signal: controller.signal })');
    expect(orders).toContain('controller.signal.aborted || detailRequestIds.current.get(orderId) !== requestId');
    expect(orders).toContain('admin_detail_loaded: true');
    expect(orderClient).toContain('{ cache: \'no-store\', signal: options.signal }');
  });

  it('gates exact units, files, tracking, and actions behind full detail on desktop and mobile', () => {
    const desktop = componentSource('const AdminOrderRow:', '// Mobile Card Component for Orders');
    const mobile = componentSource('const AdminOrderCard:');

    for (const component of [desktop, mobile]) {
      expect(component).toContain('const detailRequired = order.admin_detail_loaded === false');
      expect(component).toContain('Showing {orderItems.length} of {totalItemCount} line items.');
      expect(component).toContain('Full order details required');
      expect(component).toContain("detailLoading ? 'Loading full order...' : 'Load files & actions'");
      expect(component.indexOf('Full order details required')).toBeLessThan(component.indexOf('data-admin-tracking-group'));
      expect(component.indexOf('data-admin-tracking-group')).toBeLessThan(component.indexOf('data-admin-file-group'));
      expect(component.indexOf('data-admin-file-group')).toBeLessThan(component.indexOf('data-admin-action-group'));
    }

    expect(indexesOf(orders, 'const detailRequired = order.admin_detail_loaded === false')).toHaveLength(2);
    expect(indexesOf(orders, "'Load files & actions'")).toHaveLength(2);
    expect(orders).toContain("order.admin_detail_loaded === false ? 'Captured subset units' : 'Total Units'");
    expect(orders).toContain('Open the full order for exact units and files.');
  });

  it('posts only item identity for authoritative print-PDF loading', () => {
    const requestBody = orders.match(/const requestBody = \{([\s\S]*?)\n\s*\};/)?.[1] || '';
    const requestKeys = Array.from(
      requestBody.matchAll(/^\s+([A-Za-z_]\w*)\s*(?::|,)/gm),
      (match) => match[1],
    );

    expect(requestKeys).toEqual(['orderId', 'itemId', 'itemIndex', 'format']);
    expect(requestBody).toContain('itemId: item.id || null');
    expect(requestBody).toContain("format: 'pdf'");
    expect(requestBody).not.toMatch(/canvas|scene|text_elements|overlay_image|placement_preview/i);
    expect(orders).not.toContain('canvasStateJson');
  });
});
