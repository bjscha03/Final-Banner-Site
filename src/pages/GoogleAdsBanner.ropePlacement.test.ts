import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('./GoogleAdsBanner.tsx', import.meta.url)), 'utf8');

describe('Google Ads banner rope placement parity', () => {
  it('threads rope placement through displayed and cart-bound totals', () => {
    const calls = source.match(/calcTotals\(\{[\s\S]*?\}\)/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls.filter((call) => call.includes('ropePlacement')).length).toBeGreaterThanOrEqual(2);
    expect(source).toContain('ropePlacement,');
  });
});
