import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AdminRefundOrderAction from './AdminRefundOrderAction';
import type { Order } from '@/lib/orders/types';

const baseOrder: Order = {
  id: '11111111-1111-4111-8111-1111d0197e5c',
  user_id: null,
  email: 'liyah@example.com',
  customer_name: 'Liyah Williams',
  status: 'paid',
  subtotal_cents: 4_320,
  tax_cents: 259,
  total_cents: 4_579,
  currency: 'usd',
  created_at: '2026-08-27T00:00:00.000Z',
  items: [],
};

describe('AdminRefundOrderAction', () => {
  it('shows the protected action for a settled active order', () => {
    const html = renderToStaticMarkup(
      <AdminRefundOrderAction order={baseOrder} onRefunded={() => undefined} fullWidth />,
    );

    expect(html).toContain('Mark Cancelled / Refunded');
    expect(html).toContain('border-red-300');
  });

  it('does not offer the action after the order is already refunded', () => {
    const html = renderToStaticMarkup(
      <AdminRefundOrderAction
        order={{ ...baseOrder, status: 'refunded' }}
        onRefunded={() => undefined}
      />,
    );

    expect(html).toBe('');
  });
});
