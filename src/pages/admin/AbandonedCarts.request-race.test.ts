import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('./AbandonedCarts.tsx', import.meta.url)), 'utf8');

describe('AbandonedCarts request generation guard', () => {
  it('allows only the latest load to commit data, report errors, or clear loading', () => {
    const requestStart = source.indexOf('const requestId = ++loadRequestId.current;');
    const parsedPayloadGuard = source.indexOf('if (requestId !== loadRequestId.current) return;', source.indexOf('await response.json()'));
    const firstCommit = source.indexOf('setCarts(', requestStart);
    const lastCommit = source.indexOf('setPagination(', requestStart);

    expect(requestStart).toBeGreaterThan(-1);
    expect(parsedPayloadGuard).toBeGreaterThan(requestStart);
    expect(firstCommit).toBeGreaterThan(parsedPayloadGuard);
    expect(lastCommit).toBeGreaterThan(firstCommit);
    expect(source.match(/if \(requestId !== loadRequestId\.current\) return;/g)).toHaveLength(3);
    expect(source).toContain('if (requestId === loadRequestId.current) setLoading(false);');
  });

  it('invalidates an in-flight load when its effect is replaced or unmounted', () => {
    expect(source).toContain('return () => { loadRequestId.current += 1; };');
  });
});

describe('AbandonedCarts snapshot completeness disclosure', () => {
  it('shows source-versus-captured counts and states that item facets use the captured subset', () => {
    expect(source).toContain('Captured ${cart.stored_item_count} of ${cart.source_item_count} source cart lines.');
    expect(source).toContain("cart.snapshot_completeness === 'unknown'");
    expect(source).toContain('Size, material, and product facets use captured snapshot lines; omitted or historically unverifiable source lines cannot contribute.');
    expect(source).toContain('Captured quantity');
  });
});

describe('AbandonedCarts recovery funnel disclosure', () => {
  it('renders delivery progress, recovery events, offer lifecycle, and exact linked-order totals', () => {
    expect(source).toContain('Recovery funnel');
    expect(source).toContain('Recovery activity');
    expect(source).toContain('Recovery offers');
    expect(source).toContain('Actual recovered order');
    expect(source).toContain('cart.recovery_deliveries');
    expect(source).toContain('cart.recovery_events');
    expect(source).toContain('cart.recovery_offers');
    expect(source).toContain("'recovery_link_clicked'");
    expect(source).toContain("case 'coupon_expired'");
    expect(source).toContain('Exact retained recovery revenue');
    expect(source).toContain('actual total on an exactly linked, settled order');
  });
});
