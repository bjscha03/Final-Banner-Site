import { describe, expect, it } from 'vitest';
import {
  buildCustomerCsv,
  neutralizeSpreadsheetFormula,
  quoteCsvCell,
  type CustomerCsvRecord,
} from '../admin-customer-csv';

const customer = (overrides: Partial<CustomerCsvRecord> = {}): CustomerCsvRecord => ({
  email: 'ada@example-business.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  completedOrderCount: 2,
  lifetimeRevenueCents: 12_345,
  firstOrderAt: '2026-01-01T12:00:00.000Z',
  lastOrderAt: '2026-08-01T12:00:00.000Z',
  segment: 'repeat',
  isLapsed: false,
  marketingEligible: true,
  suppressionReason: '',
  ...overrides,
});

describe('customer CSV export', () => {
  it('defaults to marketing-eligible customers and reports exclusions', () => {
    const result = buildCustomerCsv([
      customer(),
      customer({ email: 'blocked@business.com', marketingEligible: false, suppressionReason: 'complaint' }),
    ]);

    expect(result.exported).toBe(1);
    expect(result.excluded).toBe(1);
    expect(result.csv).toContain('ada@example-business.com');
    expect(result.csv).not.toContain('blocked@business.com');
  });

  it('produces RFC 4180 quoting and neutralizes spreadsheet formulas', () => {
    expect(quoteCsvCell('Last, "First"')).toBe('"Last, ""First"""');
    expect(neutralizeSpreadsheetFormula(' =HYPERLINK("bad")')).toBe('\' =HYPERLINK("bad")');

    const result = buildCustomerCsv([
      customer({ firstName: '=2+2', lastName: 'Line\nBreak' }),
    ], { marketingOnly: false });

    expect(result.csv).toContain('"\'=2+2"');
    expect(result.csv).toContain('"Line\nBreak"');
    expect(result.csv).toContain('\r\n');
  });

  it('includes a marketing-eligible customer whose historical identity came from a profile', () => {
    const result = buildCustomerCsv([
      customer({
        email: 'legacy@customer-business.com',
        completedOrderCount: 2,
        lifetimeRevenueCents: 17_777,
        segment: 'repeat',
        isLapsed: true,
      }),
    ]);

    expect(result.exported).toBe(1);
    expect(result.csv).toContain('legacy@customer-business.com');
    expect(result.csv).toContain('"2","177.77"');
    expect(result.csv).toContain('"Lapsed"');
  });
});
