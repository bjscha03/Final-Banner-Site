// netlify/functions/resend-webhook.js
const { neon } = require('@neondatabase/serverless');
const { Resend } = require('resend');
const { ensureAbandonedCartSchema } = require('../abandoned-cart-schema.cjs');

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
    WITH reconciled_delivery AS (
      INSERT INTO cart_recovery_deliveries (
        abandoned_cart_id, sequence_number, status, provider_message_id,
        sent_at, failure_reason, metadata, updated_at
      ) VALUES (
        ${cartId}, ${sequence}, 'sent', ${providerMsgId},
        NOW(), NULL, ${metadata}::jsonb, NOW()
      )
      ON CONFLICT (abandoned_cart_id, sequence_number) DO UPDATE
        SET status = 'sent',
            provider_message_id = COALESCE(cart_recovery_deliveries.provider_message_id, EXCLUDED.provider_message_id),
            sent_at = COALESCE(cart_recovery_deliveries.sent_at, EXCLUDED.sent_at),
            failure_reason = NULL,
            metadata = cart_recovery_deliveries.metadata || EXCLUDED.metadata,
            updated_at = NOW()
        WHERE cart_recovery_deliveries.status IN ('claimed', 'failed', 'sent')
      RETURNING abandoned_cart_id, sent_at
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
