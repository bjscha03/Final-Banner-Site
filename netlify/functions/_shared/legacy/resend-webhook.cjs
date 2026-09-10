// netlify/functions/resend-webhook.js
const { neon } = require('@neondatabase/serverless');
const { Resend } = require('resend');
const { ensureAbandonedCartSchema } = require('../abandoned-cart-schema.cjs');
const {
  LARGE_BANNER_RECOVERY_CAMPAIGN,
  LARGE_BANNER_RECOVERY_PERCENTAGE,
  LARGE_BANNER_RECOVERY_SCOPE,
} = require('../recovery-discount-policy.cjs');

let ensureSchema = ensureAbandonedCartSchema;

function header(event, name) {
  const headers = event?.headers || {};
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || '';
}

function verify(event, raw) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return null;
  const signatureHeaders = {
    id: String(header(event, 'svix-id')),
    timestamp: String(header(event, 'svix-timestamp')),
    signature: String(header(event, 'svix-signature')),
  };
  if (Object.values(signatureHeaders).some((value) => !value)) return null;
  try {
    return new Resend().webhooks.verify({
      payload: raw,
      headers: signatureHeaders,
      webhookSecret: secret,
    });
  } catch {
    return null;
  }
}

function tagsFromPayload(evt) {
  const rawTags = evt?.data?.tags;
  if (Array.isArray(rawTags)) return rawTags;
  if (rawTags && typeof rawTags === 'object') {
    return Object.entries(rawTags).map(([name, value]) => ({ name, value }));
  }
  return [];
}

function tagValue(tags, name) {
  const value = tags.find((tag) => tag?.name === name)?.value;
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

const RECOVERY_EVENT_TYPES = Object.freeze({
  'email.delivered': 'email_delivered',
  'email.opened': 'email_opened',
  'email.clicked': 'email_clicked',
  'email.bounced': 'email_bounced',
  'email.complained': 'email_complained',
  'email.suppressed': 'email_suppressed',
  'email.failed': 'email_failed',
});

const RECOVERY_SUPPRESSION_REASONS = Object.freeze({
  'email.bounced': 'hard_bounce',
  'email.complained': 'complaint',
  'email.suppressed': 'provider_suppressed',
});

async function reconcileDeliveredRecovery(db, cartId, sequence, providerMsgId, providerEventId) {
  if (!cartId || !providerMsgId || !Number.isInteger(sequence) || sequence < 1 || sequence > 3) return [];
  const metadata = JSON.stringify({
    reconciled_by: 'resend_webhook',
    provider_event_id: providerEventId || null,
  });
  return db`
    WITH target AS MATERIALIZED (
      SELECT cart.id AS abandoned_cart_id,
             delivery.sequence_number,
             delivery.metadata,
             COALESCE(
               NULLIF(BTRIM(delivery.discount_code), ''),
               NULLIF(BTRIM(delivery.metadata->>'offerCode'), '')
             ) AS offer_code,
             (
               COALESCE(delivery.metadata->>'offerExpected' = 'true', FALSE)
               OR NULLIF(BTRIM(delivery.discount_code), '') IS NOT NULL
             ) AS offer_expected,
             NULLIF(delivery.metadata->>'offerExpiresAt', '')::timestamptz AS offer_expires_at,
             NULLIF(delivery.metadata->>'offerMaxDiscountAmountCents', '')::integer AS offer_cap_cents,
             delivery.metadata->'offerEligibleCartItemIds' AS offer_item_ids,
             COALESCE(NULLIF(cart.normalized_email, ''), LOWER(BTRIM(cart.email))) AS recipient
        FROM cart_recovery_deliveries AS delivery
        JOIN abandoned_carts AS cart ON cart.id = delivery.abandoned_cart_id
       WHERE delivery.abandoned_cart_id = ${cartId}
         AND delivery.sequence_number = ${sequence}
         AND delivery.status IN ('claimed', 'failed', 'sent')
         AND cart.recovery_status = 'abandoned'
         AND (
           delivery.provider_message_id IS NULL
           OR delivery.provider_message_id = ${providerMsgId}
         )
       FOR UPDATE OF delivery, cart
    ), activated_offer AS (
      UPDATE discount_codes AS discount
         SET activated_at = COALESCE(discount.activated_at, NOW()),
             issued_at = COALESCE(discount.issued_at, NOW()),
             updated_at = NOW()
        FROM target
       WHERE target.offer_expected
         AND target.sequence_number = 1
         AND discount.activated_at IS NULL
         AND discount.code = target.offer_code
         AND discount.cart_id = target.abandoned_cart_id
         AND discount.discount_percentage = ${LARGE_BANNER_RECOVERY_PERCENTAGE}
         AND discount.campaign = ${LARGE_BANNER_RECOVERY_CAMPAIGN}
         AND discount.discount_scope = ${LARGE_BANNER_RECOVERY_SCOPE}
         AND discount.expires_at = target.offer_expires_at
         AND discount.max_discount_amount_cents = target.offer_cap_cents
         AND discount.eligible_cart_item_ids = target.offer_item_ids
         AND discount.single_use = TRUE
         AND discount.max_uses_per_customer = 1
         AND discount.max_total_uses = 1
         AND discount.used = FALSE
         AND discount.order_id IS NULL
         AND discount.status = 'unused'
         AND discount.expires_at > NOW()
         AND LOWER(BTRIM(discount.email)) = target.recipient
       RETURNING discount.code, discount.expires_at, discount.activated_at,
                 discount.max_discount_amount_cents
    ), ready_offer AS (
      SELECT code, expires_at, activated_at, max_discount_amount_cents
        FROM activated_offer
      UNION ALL
      SELECT discount.code, discount.expires_at, discount.activated_at,
             discount.max_discount_amount_cents
        FROM discount_codes AS discount
        JOIN target ON target.offer_expected
                   AND discount.code = target.offer_code
                   AND discount.cart_id = target.abandoned_cart_id
       WHERE discount.activated_at IS NOT NULL
         AND discount.discount_percentage = ${LARGE_BANNER_RECOVERY_PERCENTAGE}
         AND discount.campaign = ${LARGE_BANNER_RECOVERY_CAMPAIGN}
         AND discount.discount_scope = ${LARGE_BANNER_RECOVERY_SCOPE}
         AND discount.expires_at = target.offer_expires_at
         AND discount.max_discount_amount_cents = target.offer_cap_cents
         AND discount.eligible_cart_item_ids = target.offer_item_ids
         AND discount.single_use = TRUE
         AND discount.max_uses_per_customer = 1
         AND discount.max_total_uses = 1
         AND discount.used = FALSE
         AND discount.order_id IS NULL
         AND discount.status = 'unused'
         AND discount.expires_at > NOW()
         AND LOWER(BTRIM(discount.email)) = target.recipient
    ), reconciled_delivery AS (
      UPDATE cart_recovery_deliveries AS delivery
         SET status = 'sent',
             provider_message_id = COALESCE(delivery.provider_message_id, ${providerMsgId}),
             discount_code = target.offer_code,
             sent_at = COALESCE(delivery.sent_at, NOW()),
             failure_reason = NULL,
             metadata = COALESCE(delivery.metadata, '{}'::jsonb) || ${metadata}::jsonb,
             updated_at = NOW()
        FROM target
       WHERE delivery.abandoned_cart_id = target.abandoned_cart_id
         AND delivery.sequence_number = target.sequence_number
         AND (
           NOT target.offer_expected
           OR EXISTS (SELECT 1 FROM ready_offer WHERE code = target.offer_code)
         )
       RETURNING delivery.abandoned_cart_id, delivery.sent_at, target.offer_expected,
                 target.offer_code
    ), coupon_log AS (
      INSERT INTO cart_recovery_logs (
        abandoned_cart_id, event_type, email_sequence_number, metadata, created_at
      )
      SELECT reconciled_delivery.abandoned_cart_id, 'coupon_issued', ${sequence},
             jsonb_build_object(
               'code', ready_offer.code,
               'percentage', ${LARGE_BANNER_RECOVERY_PERCENTAGE},
               'campaign', ${LARGE_BANNER_RECOVERY_CAMPAIGN},
               'scope', ${LARGE_BANNER_RECOVERY_SCOPE},
               'maxDiscountAmountCents', ready_offer.max_discount_amount_cents,
               'activatedAt', ready_offer.activated_at,
               'expiresAt', ready_offer.expires_at,
               'idempotency_key', 'recovery_coupon_issued:' || reconciled_delivery.abandoned_cart_id::text || ':' || ${sequence}::text
             ),
             NOW()
        FROM reconciled_delivery
        JOIN ready_offer ON ready_offer.code = reconciled_delivery.offer_code
       WHERE reconciled_delivery.offer_expected
      ON CONFLICT DO NOTHING
      RETURNING abandoned_cart_id
    )
    UPDATE abandoned_carts AS cart
       SET recovery_emails_sent = GREATEST(COALESCE(cart.recovery_emails_sent, 0), ${sequence}),
           last_recovery_email_at = CASE
             WHEN COALESCE(cart.recovery_emails_sent, 0) < ${sequence}
               THEN reconciled_delivery.sent_at
             ELSE cart.last_recovery_email_at
           END,
           recovery_email_claim_sequence = CASE
             WHEN cart.recovery_email_claim_sequence = ${sequence} THEN NULL
             ELSE cart.recovery_email_claim_sequence
           END,
           recovery_email_claimed_at = CASE
             WHEN cart.recovery_email_claim_sequence = ${sequence} THEN NULL
             ELSE cart.recovery_email_claimed_at
           END,
           recovery_email_last_error = CASE
             WHEN cart.recovery_email_claim_sequence = ${sequence} THEN NULL
             ELSE cart.recovery_email_last_error
           END,
           updated_at = NOW()
      FROM reconciled_delivery
     WHERE cart.id = reconciled_delivery.abandoned_cart_id
     RETURNING cart.id
  `;
}

async function recordRecoveryEvent(db, evt, event, providerMsgId, toEmail) {
  const tags = tagsFromPayload(evt);
  if (tagValue(tags, 'type') !== 'abandoned_cart') return { processed: false };

  const cartId = tagValue(tags, 'cart_id');
  const sequence = Number.parseInt(tagValue(tags, 'sequence'), 10);
  const recoveryEventType = RECOVERY_EVENT_TYPES[evt?.type];
  const providerEventId = String(header(event, 'svix-id') || '').trim().slice(0, 300);
  if (!cartId || !recoveryEventType || !providerEventId) return { processed: false };

  await ensureSchema(db);
  const cartRows = await db`
    SELECT id, normalized_email, email
      FROM abandoned_carts
     WHERE id::text = ${cartId}
     LIMIT 1
  `;
  const cart = cartRows[0];
  if (!cart) return { processed: false };

  const recipient = normalizeEmail(toEmail) || normalizeEmail(cart.normalized_email) || normalizeEmail(cart.email);
  const metadata = JSON.stringify({
    provider_event_id: providerEventId,
    provider_message_id: providerMsgId,
    provider_event_type: evt.type,
    occurred_at: evt?.created_at || new Date().toISOString(),
  });

  await db`
    INSERT INTO cart_recovery_logs (
      abandoned_cart_id, event_type, email_sequence_number, metadata, created_at
    ) VALUES (
      ${cart.id}, ${recoveryEventType},
      ${Number.isInteger(sequence) && sequence >= 1 && sequence <= 3 ? sequence : null},
      ${metadata}::jsonb, NOW()
    )
    ON CONFLICT DO NOTHING
  `;

  let deliveryReconciled = false;
  if (recoveryEventType === 'email_delivered' && Number.isInteger(sequence) && sequence >= 1 && sequence <= 3) {
    const reconciledRows = await reconcileDeliveredRecovery(
      db,
      cart.id,
      sequence,
      providerMsgId,
      providerEventId,
    );
    deliveryReconciled = reconciledRows.length > 0;
    if (!deliveryReconciled) {
      const error = new Error('Delivered recovery email could not be reconciled to a usable offer');
      error.code = 'RECOVERY_DELIVERY_RECONCILIATION_FAILED';
      throw error;
    }
  }

  const deliveryStatus = recoveryEventType === 'email_failed'
    ? 'failed'
    : RECOVERY_SUPPRESSION_REASONS[evt.type]
      ? 'suppressed'
      : null;
  if (deliveryStatus) {
    await db`
      UPDATE cart_recovery_deliveries
         SET status = ${deliveryStatus},
             failure_reason = ${RECOVERY_SUPPRESSION_REASONS[evt.type] || 'provider_failed'},
             updated_at = NOW()
       WHERE abandoned_cart_id = ${cart.id}
         AND (${Number.isInteger(sequence) ? sequence : null}::integer IS NULL
              OR sequence_number = ${Number.isInteger(sequence) ? sequence : null})
    `;
  }

  const suppressionReason = RECOVERY_SUPPRESSION_REASONS[evt.type];
  if (suppressionReason && recipient) {
    await db`
      INSERT INTO recovery_email_suppressions (
        normalized_email, reason, source, active, created_at, updated_at
      ) VALUES (
        ${recipient}, ${suppressionReason}, 'resend_webhook', TRUE, NOW(), NOW()
      )
      ON CONFLICT (normalized_email) DO UPDATE
        SET reason = EXCLUDED.reason,
            source = EXCLUDED.source,
            active = TRUE,
            updated_at = NOW()
    `;
    await db`
      UPDATE abandoned_carts
         SET recovery_suppressed_at = COALESCE(recovery_suppressed_at, NOW()),
             recovery_suppression_reason = ${suppressionReason},
             updated_at = NOW()
       WHERE normalized_email = ${recipient}
          OR LOWER(BTRIM(email)) = ${recipient}
    `;
  }

  return {
    processed: true,
    cartId: String(cart.id),
    eventType: recoveryEventType,
    deliveryReconciled,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const raw = event.isBase64Encoded
    ? Buffer.from(String(event.body || ''), 'base64').toString('utf8')
    : String(event.body || '');
  const evt = verify(event, raw);
  if (!evt) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'BAD_SIGNATURE' }) };
  }
  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    return { statusCode: 503, body: JSON.stringify({ ok: false, error: 'DATABASE_NOT_CONFIGURED' }) };
  }
  const db = neon(dbUrl);

  const providerMsgId =
    (evt && evt.data && (evt.data.email_id || (evt.data.email && evt.data.email.id) || evt.data.id)) || null;

  const toEmail = Array.isArray(evt?.data?.to)
    ? evt.data.to[0]
    : (evt?.data?.to || (Array.isArray(evt?.data?.email?.to) ? evt.data.email.to[0] : evt?.data?.email?.to) || null);

  const statusMap = {
    'email.delivered': 'delivered',
    'email.bounced': 'bounced',
    'email.complained': 'complained',
    'email.opened': 'opened'
  };
  const newStatus = statusMap[evt.type];
  let recoveryResult = { processed: false };

  if (providerMsgId && newStatus) {
    // Update email_events table with status precedence: complained > bounced > delivered > opened > sent
    const statusPrecedence = {
      'complained': 5,
      'bounced': 4,
      'delivered': 3,
      'opened': 2,
      'sent': 1,
      'error': 0
    };

    // Only update if new status has higher precedence
    const result = await db`
      UPDATE email_events
      SET status = ${newStatus}
      WHERE provider_msg_id = ${providerMsgId}
        AND (
          status = 'sent'
          OR (status = 'opened' AND ${newStatus} IN ('delivered', 'bounced', 'complained'))
          OR (status = 'delivered' AND ${newStatus} IN ('bounced', 'complained'))
          OR (status = 'bounced' AND ${newStatus} = 'complained')
        )
    `;

    // Extract order ID and email type from tags so we can update the
    // appropriate per-email-type status column on the order.
    let orderId = null;
    let emailTypeTag = null;
    if (evt.data && evt.data.tags) {
      const tags = tagsFromPayload(evt);
      const orderIdTag = tags.find(tag => tag.name === 'order_id');
      if (orderIdTag && orderIdTag.value) {
        orderId = orderIdTag.value;
      }
      const typeTag = tags.find(tag => tag.name === 'type');
      if (typeTag && typeTag.value) {
        emailTypeTag = typeTag.value;
      }
    }

    if (orderId) {
      // Map the Resend `type` tag to the orders column we should update.
      // Tag values are emitted by:
      //   notify-order.cjs                -> 'order_confirmation' / 'order_admin_notification'
      //   admin-resend-confirmation.cjs   -> 'order_confirmation'
      //   mark-in-production.cjs          -> 'order_in_production'
      //   send-shipping-notification.cjs  -> 'order_shipped'
      // For backwards compatibility (older sent emails had no `type` tag),
      // we default to updating confirmation_email_status.
      const tagToColumn = {
        order_confirmation: 'confirmation_email_status',
        order_admin_notification: null, // admin notifications don't need a per-order column
        order_in_production: 'production_email_status',
        order_shipped: 'shipping_notification_status',
      };
      const column = Object.prototype.hasOwnProperty.call(tagToColumn, emailTypeTag)
        ? tagToColumn[emailTypeTag]
        : 'confirmation_email_status';

      if (column) {
        try {
          // neon's tagged-template binding does not support dynamic column
          // names, so we route to a fixed UPDATE per column. This keeps the
          // query parameterised and avoids any SQL injection risk.
          if (column === 'confirmation_email_status') {
            await db`
              UPDATE orders
              SET confirmation_email_status = ${newStatus}
              WHERE id = ${orderId}
            `;
          } else if (column === 'production_email_status') {
            await db`
              UPDATE orders
              SET production_email_status = ${newStatus}
              WHERE id = ${orderId}
            `;
          } else if (column === 'shipping_notification_status') {
            await db`
              UPDATE orders
              SET shipping_notification_status = ${newStatus}
              WHERE id = ${orderId}
            `;
          }
        } catch (colErr) {
          // The new status columns may not exist yet on legacy databases;
          // log and continue so we still record the email_events row.
          console.warn(`webhook: failed to update orders.${column} for ${orderId}:`, colErr.message);
        }
      }
    }

    console.log('webhook update', {
      providerMsgId,
      newStatus,
      orderId,
      emailTypeTag,
      rowCount: result.count || result.rowCount,
      eventType: evt.type
    });
  } else {
    console.log('webhook received but not processed', {
      eventType: evt.type,
      providerMsgId,
      hasStatus: !!newStatus
    });
  }

  try {
    recoveryResult = await recordRecoveryEvent(db, evt, event, providerMsgId, toEmail);
  } catch (error) {
    console.error('recovery webhook processing failed', {
      eventType: evt?.type,
      providerMsgId,
      message: error?.message || String(error),
    });
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'RECOVERY_EVENT_FAILED' }) };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, recoveryProcessed: recoveryResult.processed }),
  };
};

exports._test = {
  RECOVERY_EVENT_TYPES,
  RECOVERY_SUPPRESSION_REASONS,
  normalizeEmail,
  reconcileDeliveredRecovery,
  recordRecoveryEvent,
  resetDependencies() { ensureSchema = ensureAbandonedCartSchema; },
  setEnsureSchema(value) { ensureSchema = value; },
  tagValue,
  tagsFromPayload,
};
