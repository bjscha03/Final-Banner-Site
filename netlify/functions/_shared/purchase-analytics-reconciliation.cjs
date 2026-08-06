'use strict';

function getCanonicalTransactionId(order) {
  return String(order?.order_number || order?.id || '').trim();
}

module.exports = { getCanonicalTransactionId };
