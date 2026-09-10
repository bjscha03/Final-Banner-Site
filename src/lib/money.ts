/**
 * Money utility functions for precise currency calculations
 * All calculations use cents to avoid floating-point precision issues
 */

/**
 * Convert dollars to cents
 * @param n - Dollar amount
 * @returns Amount in cents, rounded to nearest integer
 */
export const toCents = (n: number): number => Math.round(n * 100);

/**
 * Convert cents to dollars
 * @param c - Amount in cents
 * @returns Dollar amount
 */
export const fromCents = (c: number): number => c / 100;

/**
 * Format cents as USD currency string
 * @param cents - Amount in cents
 * @returns Formatted currency string (e.g., "$12.34")
 */
export const fmtUSD = (cents: number): string =>
  new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD' 
  }).format(fromCents(cents));

/**
 * Calculate tax in cents
 * @param subtotalCents - Subtotal amount in cents
 * @param taxRate - Tax rate as decimal (e.g., 0.06 for 6%)
 * @returns Tax amount in cents, rounded
 */
export const calculateTaxCents = (subtotalCents: number, taxRate: number): number =>
  Math.round(subtotalCents * taxRate);

/**
 * Calculate total from subtotal and tax
 * @param subtotalCents - Subtotal in cents
 * @param taxCents - Tax in cents
 * @returns Total in cents
 */
export const calculateTotalCents = (subtotalCents: number, taxCents: number): number =>
  subtotalCents + taxCents;
