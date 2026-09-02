export type CustomerCsvRecord = {
  email: string;
  firstName: string;
  lastName: string;
  completedOrderCount: number;
  lifetimeRevenueCents: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  segment: string;
  isLapsed: boolean;
  marketingEligible: boolean;
  suppressionReason: string;
};

const HEADERS = [
  'First name',
  'Last name',
  'Email',
  'Completed orders',
  'Lifetime revenue',
  'First order',
  'Last order',
  'Segment',
  'Marketing eligible',
  'Suppression reason',
];

const dateOnly = (value: string | null): string => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
};

const segmentLabel = (customer: CustomerCsvRecord): string => {
  if (customer.isLapsed) return 'Inactive';
  if (customer.segment === 'repeat') return 'Repeat';
  if (customer.segment === 'first_time') return 'First-time';
  return 'No completed order';
};

/** Prevent spreadsheet applications from evaluating exported customer data. */
export const neutralizeSpreadsheetFormula = (value: unknown): string => {
  const text = String(value ?? '');
  return /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
};

export const quoteCsvCell = (value: unknown): string => {
  const safe = neutralizeSpreadsheetFormula(value).replace(/"/g, '""');
  return `"${safe}"`;
};

export function buildCustomerCsv(
  customers: CustomerCsvRecord[],
  options: { marketingOnly?: boolean } = {},
): { csv: string; exported: number; excluded: number } {
  const marketingOnly = options.marketingOnly !== false;
  const included = marketingOnly
    ? customers.filter((customer) => customer.marketingEligible)
    : customers;
  const rows = included.map((customer) => [
    customer.firstName,
    customer.lastName,
    customer.email,
    customer.completedOrderCount,
    (Math.max(0, Number(customer.lifetimeRevenueCents) || 0) / 100).toFixed(2),
    dateOnly(customer.firstOrderAt),
    dateOnly(customer.lastOrderAt),
    segmentLabel(customer),
    customer.marketingEligible ? 'Yes' : 'No',
    customer.suppressionReason,
  ]);
  const csv = [HEADERS, ...rows]
    .map((row) => row.map(quoteCsvCell).join(','))
    .join('\r\n');

  return {
    csv,
    exported: included.length,
    excluded: customers.length - included.length,
  };
}
