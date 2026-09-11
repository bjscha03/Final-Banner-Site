import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SameDayHitServiceCard from './SameDayHitServiceCard';

const state = vi.hoisted(() => ({
  items: [{ product_type: 'banner', quantity: 1, line_total_cents: 8000 }],
  sameDayHitService: false, saturdayDelivery: false,
  setSameDayHitService: vi.fn(), setSaturdayDelivery: vi.fn(), reconcileSameDayHitService: vi.fn(),
}));
vi.mock('@/store/cart', () => ({ useCartStore: (selector: (s: typeof state) => unknown) => selector(state) }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
afterEach(() => { vi.useRealTimers(); state.sameDayHitService = false; state.saturdayDelivery = false; });

describe.each(['default', 'compact'] as const)('Saturday option: %s', (variant) => {
  const render = () => renderToStaticMarkup(<SameDayHitServiceCard variant={variant} previewSubtotalCents={8000} />);
  it('only expands after Friday HIT selection and displays separate $48 / $50 fees', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-11T16:59:59Z'));
    expect(render()).not.toContain('Need it Saturday?');
    state.sameDayHitService = true;
    const html = render();
    expect(html).toContain('Need it Saturday?'); expect(html).toContain('$48.00'); expect(html).toContain('$50.00');
    expect(html).toContain('expected Monday delivery without this upgrade');
    state.saturdayDelivery = true;
    expect(render()).toContain('expected Saturday delivery');
    vi.setSystemTime(new Date('2026-09-11T17:00:00Z'));
    expect(render()).toBe('');
  });
  it('does not offer Saturday on Thursday or the weekend', () => {
    vi.useFakeTimers(); state.sameDayHitService = true;
    for (const iso of ['2026-09-10T14:00:00Z', '2026-09-12T14:00:00Z', '2026-09-13T14:00:00Z']) {
      vi.setSystemTime(new Date(iso)); expect(render()).not.toContain('Need it Saturday?');
    }
  });
});
