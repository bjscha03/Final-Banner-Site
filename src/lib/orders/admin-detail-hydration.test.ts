import { describe, expect, it, vi } from 'vitest';
import {
  ADMIN_ORDER_DETAIL_CONCURRENCY,
  hydrateAdminOrderPage,
} from './admin-detail-hydration';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('admin order page detail hydration', () => {
  it('hydrates every unique visible order without exceeding the concurrency cap', async () => {
    const gate = deferred();
    const calls: string[] = [];
    let active = 0;
    let maxActive = 0;

    const hydration = hydrateAdminOrderPage({
      orderIds: ['one', 'two', 'three', 'four', 'five', 'one'],
      shouldContinue: () => true,
      hydrate: async (orderId) => {
        calls.push(orderId);
        active += 1;
        maxActive = Math.max(maxActive, active);
        await gate.promise;
        active -= 1;
      },
    });

    await vi.waitFor(() => expect(calls).toHaveLength(ADMIN_ORDER_DETAIL_CONCURRENCY));
    expect(maxActive).toBe(ADMIN_ORDER_DETAIL_CONCURRENCY);
    gate.resolve();
    await hydration;

    expect(calls).toHaveLength(5);
    expect(new Set(calls).size).toBe(5);
    expect(maxActive).toBe(ADMIN_ORDER_DETAIL_CONCURRENCY);
  });

  it('does not start queued requests after the current page becomes stale', async () => {
    const gate = deferred();
    const calls: string[] = [];
    let currentPage = true;

    const hydration = hydrateAdminOrderPage({
      orderIds: ['one', 'two', 'three', 'four'],
      concurrency: 2,
      shouldContinue: () => currentPage,
      hydrate: async (orderId) => {
        calls.push(orderId);
        await gate.promise;
      },
    });

    await vi.waitFor(() => expect(calls).toHaveLength(2));
    currentPage = false;
    gate.resolve();
    await hydration;

    expect(calls).toEqual(['one', 'two']);
  });

  it('does nothing when hydration is already stale', async () => {
    const hydrate = vi.fn(async () => undefined);
    await hydrateAdminOrderPage({
      orderIds: ['one'],
      shouldContinue: () => false,
      hydrate,
    });
    expect(hydrate).not.toHaveBeenCalled();
  });
});
