'use strict';
const { UUID, REFUNDABLE_STATUSES } = require('./admin-refund-order.cjs');

class PartialRefundError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function validateInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new PartialRefundError(400, 'Invalid request body.');
  if (!UUID.test(String(body.orderId || ''))) throw new PartialRefundError(400, 'A valid order is required.');
  for (const key of ['amountCents', 'taxCents', 'previousAmountCents', 'previousTaxCents']) {
    if (!Number.isSafeInteger(body[key]) || body[key] < 0 || body[key] > 2147483647) {
      throw new PartialRefundError(400, 'Enter a valid refund amount with no more than two decimal places.');
    }
  }
  if (body.taxCents > body.amountCents) throw new PartialRefundError(400, 'Refunded tax cannot exceed the refund total.');
  if (typeof body.note !== 'string' || body.note.length > 500) throw new PartialRefundError(400, 'Keep the note to 500 characters.');
}

async function recordPartialRefund(sql, body, adminIdentifier) {
  validateInput(body);
  // Lock and compare the saved total. Concurrent edits cannot silently replace
  // one another, and a retry of an already-saved total is a no-op.
  const rows = await sql`
    WITH existing AS MATERIALIZED (
      SELECT id, status, total_cents, tax_cents, partial_refund_cents, partial_refund_tax_cents, partial_refund_history, updated_at
      FROM orders WHERE id = ${body.orderId}::uuid FOR UPDATE
    ), changed AS (
      UPDATE orders o
      SET partial_refund_cents = ${body.amountCents}, partial_refund_tax_cents = ${body.taxCents},
          partial_refund_history = COALESCE(o.partial_refund_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
            'recorded_at', NOW(), 'admin', ${adminIdentifier}::text, 'note', ${body.note.trim()}::text,
            'previous_amount_cents', existing.partial_refund_cents, 'amount_cents', ${body.amountCents}::integer,
            'previous_tax_cents', existing.partial_refund_tax_cents, 'tax_cents', ${body.taxCents}::integer
          )), updated_at = NOW()
      FROM existing WHERE o.id = existing.id
        AND LOWER(existing.status) IN ('paid', 'in_production', 'shipped', 'delivered', 'fulfilled')
        AND ${body.amountCents} < existing.total_cents
        AND ${body.taxCents} <= GREATEST(COALESCE(existing.tax_cents, 0), 0)
        AND existing.partial_refund_cents = ${body.previousAmountCents}
        AND existing.partial_refund_tax_cents = ${body.previousTaxCents}
        AND (existing.partial_refund_cents <> ${body.amountCents} OR existing.partial_refund_tax_cents <> ${body.taxCents})
      RETURNING o.id, o.status, o.total_cents, o.partial_refund_cents, o.partial_refund_tax_cents, o.partial_refund_history, o.updated_at
    ) SELECT row_to_json(existing) AS previous, (SELECT row_to_json(changed) FROM changed) AS updated FROM existing
  `;
  const row = rows[0];
  if (!row) throw new PartialRefundError(404, 'Order not found.');
  if (row.updated) return { order: row.updated, alreadyRecorded: false };
  const order = row.previous;
  if (!REFUNDABLE_STATUSES.has(String(order.status).toLowerCase())) throw new PartialRefundError(409, 'Partial refunds can only be recorded for paid orders that are not fully refunded.');
  if (body.amountCents >= Number(order.total_cents)) throw new PartialRefundError(400, 'For a full refund, use Mark Cancelled / Refunded. A partial refund must be less than the order total.');
  if (body.taxCents > Math.max(Number(order.tax_cents) || 0, 0)) throw new PartialRefundError(400, 'Refunded tax cannot exceed the tax collected on this order.');
  if (Number(order.partial_refund_cents) === body.amountCents && Number(order.partial_refund_tax_cents) === body.taxCents) return { order, alreadyRecorded: true };
  throw new PartialRefundError(409, 'The refund record changed in another session. Refresh this order before saving again.');
}
module.exports = { PartialRefundError, validateInput, recordPartialRefund };
