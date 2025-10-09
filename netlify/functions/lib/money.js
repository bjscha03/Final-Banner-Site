/**
 * Money utility functions for precise currency calculations
 * All calculations use cents to avoid floating-point precision issues
 */

/**
 * Convert dollars to cents
 * @param {number} n - Dollar amount
 * @returns {number} Amount in cents, rounded to nearest integer
 */
const toCents = (n) => Math.round(n * 100);

/**
 * Convert cents to dollars
 * @param {number} c - Amount in cents
 * @returns {number} Dollar amount
 */
const fromCents = (c) => c / 100;

/**
 * Format cents as USD currency string
 * @param {number} cents - Amount in cents
 * @returns {string} Formatted currency string (e.g., "$12.34")
 */
const fmtUSD = (cents) =>
  new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD' 
  }).format(fromCents(cents));

/**
 * Calculate tax in cents
 * @param {number} subtotalCents - Subtotal amount in cents
 * @param {number} taxRate - Tax rate as decimal (e.g., 0.06 for 6%)
 * @returns {number} Tax amount in cents, rounded
 */
const calculateTaxCents = (subtotalCents, taxRate) =>
  Math.round(subtotalCents * taxRate);

/**
 * Calculate total from subtotal and tax
 * @param {number} subtotalCents - Subtotal in cents
 * @param {number} taxCents - Tax in cents
 * @returns {number} Total in cents
 */
const calculateTotalCents = (subtotalCents, taxCents) =>
  subtotalCents + taxCents;

module.exports = {
  toCents,
  fromCents,
  fmtUSD,
  calculateTaxCents,
  calculateTotalCents
};
