'use strict';

const { sanitizeForAudit } = require('./security.cjs');

const COST_CATEGORIES = Object.freeze(['openai', 'discovery', 'email_verification', 'resend']);
const MAX_OPENAI_COST_PER_PROSPECT_MICROUSD = 10000;
const MAX_BUDGET_TRANSACTION_ATTEMPTS = 3;

const RESERVATION_SQL = `WITH budget AS (
  SELECT CASE
           WHEN $1 = 'openai' THEN monthly_openai_budget_cents
           WHEN $1 IN ('discovery', 'email_verification') THEN monthly_provider_budget_cents
           ELSE 0
         END::bigint * 10000 AS limit_microusd
    FROM outbound_settings
   WHERE id = 1
   FOR UPDATE
), existing AS (
  SELECT id, category, reservation_key, status,
         estimated_cost_microusd, actual_cost_microusd
    FROM outbound_cost_ledger
   WHERE reservation_key = $3
), used AS (
  SELECT COALESCE(SUM(CASE
           WHEN status = 'committed' THEN COALESCE(actual_cost_microusd, estimated_cost_microusd)
           WHEN status = 'reserved' THEN estimated_cost_microusd
           ELSE 0
         END), 0)::bigint AS used_microusd
    FROM outbound_cost_ledger
   WHERE category = $1
     AND occurred_at >= date_trunc('month', NOW())
     AND occurred_at < date_trunc('month', NOW()) + INTERVAL '1 month'
), inserted AS (
  INSERT INTO outbound_cost_ledger (
    category, provider_id, reservation_key, status,
    estimated_cost_microusd, reference_type, reference_id, usage_metadata
  )
  SELECT $1, $2, $3, 'reserved', $4, $5, $6::uuid, $7::jsonb
    FROM budget, used
   WHERE NOT EXISTS (SELECT 1 FROM existing)
     AND used.used_microusd + $4 <= budget.limit_microusd
  ON CONFLICT (reservation_key) DO NOTHING
  RETURNING id, category, reservation_key, status,
            estimated_cost_microusd, actual_cost_microusd
)
SELECT id, category, reservation_key, status,
       estimated_cost_microusd, actual_cost_microusd, FALSE AS existing
  FROM inserted
UNION ALL
SELECT id, category, reservation_key, status,
       estimated_cost_microusd, actual_cost_microusd, TRUE AS existing
  FROM existing
 WHERE NOT EXISTS (SELECT 1 FROM inserted)
LIMIT 1`;

function validateCost(category, estimatedCostMicrousd) {
  if (!COST_CATEGORIES.includes(category)) throw new TypeError(`Unsupported outbound cost category: ${category}`);
  const amount = Number(estimatedCostMicrousd);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new TypeError('Estimated cost must be a non-negative integer in micro-USD.');
  if (category === 'openai' && amount > MAX_OPENAI_COST_PER_PROSPECT_MICROUSD) {
    const error = new Error('Projected OpenAI cost exceeds the per-prospect application ceiling.');
    error.code = 'OPENAI_PROSPECT_COST_LIMIT';
    throw error;
  }
  return amount;
}

async function reserveBudget(sql, reservation) {
  const amount = validateCost(reservation.category, reservation.estimatedCostMicrousd);
  const reservationKey = String(reservation.reservationKey || '').trim();
  if (!reservationKey || reservationKey.length > 300) throw new TypeError('A bounded budget reservation key is required.');
  if (typeof sql?.transaction !== 'function') {
    const error = new Error('Atomic outbound budget transactions are unavailable.');
    error.code = 'BUDGET_TRANSACTION_UNAVAILABLE';
    throw error;
  }
  const params = [
    reservation.category,
    reservation.providerId || null,
    reservationKey,
    amount,
    reservation.referenceType || null,
    reservation.referenceId || null,
    JSON.stringify(sanitizeForAudit(reservation.usageMetadata || {})),
  ];

  let lastError;
  for (let attempt = 1; attempt <= MAX_BUDGET_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      // Neon HTTP transactions are non-interactive: the callback must return
      // its query array synchronously. Serializable isolation makes concurrent
      // sum-and-insert attempts fail rather than oversubscribe the local limit.
      const [rows] = await sql.transaction(
        (tx) => [tx(RESERVATION_SQL, params)],
        { isolationLevel: 'Serializable' },
      );
      const row = rows?.[0] || null;
      if (row?.existing && (row.category !== reservation.category || Number(row.estimated_cost_microusd) !== amount)) {
        const error = new Error('Budget reservation key was reused with different cost data.');
        error.code = 'BUDGET_RESERVATION_CONFLICT';
        throw error;
      }
      return row;
    } catch (error) {
      if (!['40001', '40P01'].includes(error?.code) || attempt === MAX_BUDGET_TRANSACTION_ATTEMPTS) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

async function commitBudget(sql, { reservationKey, actualCostMicrousd, usageMetadata = {} }) {
  const amount = Number(actualCostMicrousd);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new TypeError('Actual cost must be a non-negative integer in micro-USD.');
  const rows = await sql(
    `UPDATE outbound_cost_ledger
        SET status = 'committed', actual_cost_microusd = $2,
            usage_metadata = usage_metadata || $3::jsonb, finalized_at = NOW()
      WHERE reservation_key = $1 AND status IN ('reserved', 'committed')
     RETURNING id, status, estimated_cost_microusd, actual_cost_microusd`,
    [reservationKey, amount, JSON.stringify(sanitizeForAudit(usageMetadata))],
  );
  return rows[0] || null;
}

async function releaseBudget(sql, reservationKey) {
  const rows = await sql(
    `UPDATE outbound_cost_ledger
        SET status = 'released', finalized_at = NOW()
      WHERE reservation_key = $1 AND status = 'reserved'
     RETURNING id, status`,
    [reservationKey],
  );
  return rows[0] || null;
}

module.exports = {
  COST_CATEGORIES,
  MAX_OPENAI_COST_PER_PROSPECT_MICROUSD,
  MAX_BUDGET_TRANSACTION_ATTEMPTS,
  validateCost,
  reserveBudget,
  commitBudget,
  releaseBudget,
};
