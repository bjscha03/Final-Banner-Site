import { describe, expect, it } from 'vitest';
import { fedexUrl, normalizeTrackingEntries, validateTrackingEntries } from './tracking';

describe('tracking helpers', () => {
  it('saves one tracking number shape', () => {
    expect(validateTrackingEntries([{ carrier: 'fedex', trackingNumber: ' 123 ', label: '' }])).toEqual([{ carrier: 'fedex', trackingNumber: '123', label: 'Package 1' }]);
  });
  it('saves multiple tracking numbers', () => {
    expect(validateTrackingEntries([{ carrier: 'fedex', trackingNumber: '123', label: 'Box' }, { carrier: 'fedex', trackingNumber: '987', label: 'Signs' }])).toHaveLength(2);
  });
  it('removing a tracking row leaves remaining rows valid', () => {
    const rows = [{ carrier: 'fedex' as const, trackingNumber: '123' }, { carrier: 'fedex' as const, trackingNumber: '987' }].filter((_, i) => i !== 0);
    expect(validateTrackingEntries(rows)[0].trackingNumber).toBe('987');
  });
  it('rejects blank rows', () => {
    expect(() => validateTrackingEntries([{ carrier: 'fedex', trackingNumber: '' } as any])).toThrow(/Blank|blank|cannot/);
  });
  it('rejects an empty tracking array so legacy values are not erased', () => {
    expect(() => validateTrackingEntries([])).toThrow(/At least one/);
  });
  it('rejects duplicate tracking numbers', () => {
    expect(() => validateTrackingEntries([{ carrier: 'fedex', trackingNumber: '123' }, { carrier: 'fedex', trackingNumber: ' 123 ' }] as any)).toThrow(/Duplicate|duplicated/);
  });
  it('loads old orders with a single tracking-number field', () => {
    expect(normalizeTrackingEntries({ tracking_number: 'legacy' })).toEqual([{ carrier: 'fedex', trackingNumber: 'legacy', label: 'Package 1' }]);
  });
  it('generates correct FedEx tracking links', () => {
    expect(fedexUrl('123 456')).toBe('https://www.fedex.com/fedextrack/?trknbr=123%20456');
  });
  it('supports one-number and multiple-number shipment email data', () => {
    expect(normalizeTrackingEntries([{ carrier: 'fedex', trackingNumber: 'one' }])).toHaveLength(1);
    expect(normalizeTrackingEntries([{ carrier: 'fedex', trackingNumber: 'one' }, { carrier: 'fedex', trackingNumber: 'two' }])).toHaveLength(2);
  });
  it('editing tracking numbers before resending uses latest normalized rows', () => {
    const edited = validateTrackingEntries([{ carrier: 'fedex', trackingNumber: 'new-1' }, { carrier: 'fedex', trackingNumber: 'new-2' }] as any);
    expect(edited.map((row) => row.trackingNumber)).toEqual(['new-1', 'new-2']);
  });
});
