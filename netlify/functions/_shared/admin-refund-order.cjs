'use strict';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REFUNDABLE_STATUSES = new Set(['paid', 'in_production', 'shipped']);

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function interpretRefundRow(row) {
  if (!row) return { outcome: 'not_found' };

  const previousStatus = normalizeStatus(row.previous_status);
  if (previousStatus === 'refunded') {
    return {
      outcome: 'already_refunded',
      order: {
        id: row.id,
        status: 'refunded',
        total_cents: Number(row.total_cents) || 0,
        updated_at: row.updated_at || null,
      },
      previousStatus,
    };
  }

  if (!REFUNDABLE_STATUSES.has(previousStatus) || !row.updated_status) {
    return { outcome: 'invalid_status', previousStatus };
  }

  return {
    outcome: 'refunded',
    order: {
      id: row.id,
      status: normalizeStatus(row.updated_status),
      total_cents: Number(row.total_cents) || 0,
      updated_at: row.updated_at || null,
    },
    previousStatus,
  };
}

async function markOrderRefunded(sql, orderId) {
  const rows = await sql`
    WITH existing AS (
      SELECT id, status, total_cents, updated_at
      FROM orders
      WHERE id = ${orderId}
      FOR UPDATE
    ), updated AS (
      UPDATE orders AS target
      SET status = 'refunded',
          updated_at = NOW()
      FROM existing
      WHERE target.id = existing.id
        AND LOWER(COALESCE(existing.status, '')) IN ('paid', 'in_production', 'shipped')
      RETURNING target.id, target.status, target.total_cents, target.updated_at
    )
    SELECT existing.id,
           existing.status AS previous_status,
           existing.total_cents,
           COALESCE(updated.updated_at, existing.updated_at) AS updated_at,
           updated.status AS updated_status
    FROM existing
    LEFT JOIN updated ON updated.id = existing.id
  `;

  return interpretRefundRow(rows[0]);
}

module.exports = {
  UUID,
  REFUNDABLE_STATUSES,
  interpretRefundRow,
  markOrderRefunded,
};
