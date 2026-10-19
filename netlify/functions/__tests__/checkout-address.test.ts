import { afterEach, describe, expect, it, vi } from 'vitest';
import handler, { parseAddress, validationResult } from '../checkout-address.mts';

const token = '00000000-0000-4000-a000-000000000000';
const req = (body: unknown, origin = 'https://preview.example.com') => new Request('https://preview.example.com/.netlify/functions/checkout-address', {
  method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const component = (type: string, longText: string, shortText = longText) => ({ types: [type], longText, shortText });
const components = [component('street_number', '1600'), component('route', 'Pennsylvania Avenue Northwest'),
  component('locality', 'Washington'), component('administrative_area_level_1', 'District of Columbia', 'DC'),
  component('postal_code', '20500'), component('country', 'United States', 'US')];
afterEach(() => vi.unstubAllGlobals());

describe('address lookup boundary', () => {
  it('rejects foreign origins and invalid requests before calling Google', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect((await handler(req({ action: 'suggest', query: '1600', sessionToken: token }, 'https://unrelated.example'))).status).toBe(403);
    expect((await handler(req({ action: 'details', placeId: '../secrets', sessionToken: token }))).status).toBe(400);
    expect((await handler(req({ action: 'suggest', query: 'a', sessionToken: token }))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps credentials server-side and restricts searches to the US', async () => {
    vi.stubGlobal('Netlify', { env: { get: () => 'server-only-test-key' } });
    const fetch = vi.fn().mockResolvedValue(Response.json({ suggestions: [{ placePrediction: { placeId: 'place-1', text: { text: 'Public landmark' } } }] }));
    vi.stubGlobal('fetch', fetch);
    const response = await handler(req({ action: 'suggest', query: '1600 Pennsylvania', sessionToken: token }));
    expect(await response.json()).toEqual({ suggestions: [{ id: 'place-1', label: 'Public landmark' }] });
    const options = fetch.mock.calls[0][1];
    expect(JSON.parse(options.body)).toMatchObject({ includedRegionCodes: ['us'], sessionToken: token });
    expect(options.headers['X-Goog-Api-Key']).toBe('server-only-test-key');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
  it('never fills a street-only match or a foreign address', async () => {
    vi.stubGlobal('Netlify', { env: { get: () => 'test' } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ addressComponents: components.filter(x => !x.types.includes('street_number')) })));
    expect((await handler(req({ action: 'details', placeId: 'street-only', sessionToken: token }))).status).toBe(422);
  });
  it('returns a usable full address with state abbreviation and ZIP+4', () => {
    expect(parseAddress([...components, component('postal_code_suffix', '0003'), component('subpremise', '10')])).toEqual({
      street: '1600 Pennsylvania Avenue Northwest', street2: '10', city: 'Washington', state: 'DC', zip: '20500-0003', country: 'US', hasStreetNumber: true,
    });
  });
  it('falls back safely when the provider fails without leaking its response', async () => {
    vi.stubGlobal('Netlify', { env: { get: () => 'test-secret' } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ message: 'private provider diagnostics' }, { status: 403 })));
    const response = await handler(req({ action: 'suggest', query: '1600 Pennsylvania', sessionToken: token }));
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: 'LOOKUP_UNAVAILABLE' });
  });
  it('requires review of corrections, missing apartments, and unconfirmed units', () => {
    const good = { verdict: { addressComplete: true, validationGranularity: 'PREMISE' }, uspsData: { dpvConfirmation: 'Y' } };
    expect(validationResult(good).valid).toBe(true);
    expect(validationResult({ ...good, verdict: { ...good.verdict, hasReplacedComponents: true } }).valid).toBe(false);
    expect(validationResult({ ...good, uspsData: { dpvConfirmation: 'D' } })).toMatchObject({ valid: false, message: expect.stringContaining('apartment') });
    expect(validationResult({ ...good, uspsData: { dpvConfirmation: 'S' } }).valid).toBe(false);
    expect(validationResult({}).valid).toBe(false);
  });
});
