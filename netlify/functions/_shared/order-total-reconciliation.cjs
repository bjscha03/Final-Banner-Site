'use strict';

function cents(value, field) {
  const normalized = Number(value ?? 0);
  if (!Number.isInteger(normalized) || normalized < 0) {
    throw new Error(`${field} must be a non-negative integer number of cents`);
  }
  return normalized;
}

function addPostTaxServiceFees({ baseTotalCents, sameDayFeeCents, saturdayFeeCents }) {
  return cents(baseTotalCents, 'baseTotalCents')
    + cents(sameDayFeeCents, 'sameDayFeeCents')
    + cents(saturdayFeeCents, 'saturdayFeeCents');
}

module.exports = { addPostTaxServiceFees };
