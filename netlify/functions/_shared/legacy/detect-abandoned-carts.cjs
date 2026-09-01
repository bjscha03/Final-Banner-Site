'use strict';

const { randomUUID } = require('crypto');
const { neon } = require('@neondatabase/serverless');
const { Resend } = require('resend');
const { ensureAbandonedCartSchema } = require('../abandoned-cart-schema.cjs');
const sendModule = require('./send-abandoned-cart-email.cjs');

let neonFactory = neon;
let resendFactory = (apiKey) => new Resend(apiKey);
let ensureSchema = ensureAbandonedCartSchema;
let deliverRecoveryEmail = sendModule.deliverRecoveryEmail;

const CART_STATE_BATCH_SIZE = 500;
const RECIPIENT_GROUP_BATCH_SIZE = 200;
const DELIVERY_BATCH_SIZE = 50;
const DELIVERY_RETRY_BACKOFF_HOURS = 1;
const CLAIM_STALE_MINUTES = 20;
const DELIVERY_START_BUFFER_MS = 30 * 1000;
const WORKER_SOFT_LIMIT_MS = 12 * 60 * 1000;
const WORKER_LEASE_MINUTES = 14;
const WORKER_JOB_NAME = 'abandoned-cart-recovery';

async function settleCompletedCarts(sql) {
  return sql`
    WITH cart_batch AS (
      SELECT id
        FROM abandoned_carts AS batch_cart
       WHERE batch_cart.recovery_status IN ('active', 'abandoned')
         AND EXISTS (
           SELECT 1
             FROM orders AS batch_order
             LEFT JOIN abandoned_carts AS batch_linked_cart
               ON batch_linked_cart.id = batch_order.abandoned_cart_id
            WHERE (
                    batch_order.status IN ('paid', 'in_production', 'shipped', 'delivered', 'fulfilled', 'refunded')
                    OR (
                      LOWER(BTRIM(COALESCE(batch_order.status, ''))) = 'pending'
                      AND (
                        NULLIF(BTRIM(to_jsonb(batch_order)->>'paypal_capture_id'), '') IS NOT NULL
                        OR (
                          LOWER(BTRIM(COALESCE(to_jsonb(batch_order)->>'payment_method', ''))) = 'paypal'
                          AND LOWER(BTRIM(COALESCE(to_jsonb(batch_order)->>'payment_reconciliation_status', ''))) = 'complete'
                        )
                      )
                    )
                  )
              AND COALESCE(batch_order.is_test_order, FALSE) = FALSE
              AND (
                batch_order.abandoned_cart_id = batch_cart.id
                OR (
                  batch_order.abandoned_cart_id IS NULL
                  AND (
                    (
                      batch_cart.session_id IS NOT NULL
                      AND batch_cart.session_id = NULLIF(BTRIM(batch_order.abandoned_cart_session_id), '')
                      AND batch_cart.created_at <= batch_order.created_at + INTERVAL '10 minutes'
                      AND batch_cart.last_activity_at >= batch_order.created_at - INTERVAL '30 minutes'
                      AND batch_cart.last_activity_at <= batch_order.created_at + INTERVAL '10 minutes'
                    )
                    OR (
                      NULLIF(BTRIM(batch_order.abandoned_cart_session_id), '') IS NULL
                      AND
                      batch_cart.created_at <= batch_order.created_at
                      AND batch_cart.last_activity_at <= batch_order.created_at
                      -- Identity-only matching is a legacy fallback for orders
                      -- that predate exact cart/session attribution. Keep that
                      -- inference inside the same finite recovery window so a
                      -- much later purchase cannot fabricate a recovered cart.
                      AND batch_order.created_at <= batch_cart.last_activity_at + INTERVAL '96 hours'
                      AND (
                        (batch_cart.user_id IS NOT NULL AND batch_order.user_id = batch_cart.user_id)
                        OR (
                          NULLIF(COALESCE(batch_cart.normalized_email, LOWER(BTRIM(batch_cart.email))), '') IS NOT NULL
                          AND LOWER(BTRIM(batch_order.email)) =
                              COALESCE(batch_cart.normalized_email, LOWER(BTRIM(batch_cart.email)))
                        )
                      )
                    )
                  )
                )
                OR (
                  batch_order.abandoned_cart_id IS NOT NULL
                  AND batch_order.abandoned_cart_id <> batch_cart.id
                  AND batch_cart.created_at <= batch_order.created_at
                  AND batch_cart.last_activity_at <= batch_order.created_at
                  AND batch_order.created_at <= batch_cart.last_activity_at + INTERVAL '96 hours'
                  AND (
                    (
                      batch_cart.user_id IS NOT NULL
                      AND (
                        batch_order.user_id = batch_cart.user_id
                        OR batch_linked_cart.user_id = batch_cart.user_id
                      )
                    )
                    OR (
                      batch_cart.session_id IS NOT NULL
                      AND batch_linked_cart.session_id = batch_cart.session_id
                    )
                    OR (
                      NULLIF(COALESCE(batch_cart.normalized_email, LOWER(BTRIM(batch_cart.email))), '') IS NOT NULL
                      AND (
                        LOWER(BTRIM(batch_order.email)) =
                            COALESCE(batch_cart.normalized_email, LOWER(BTRIM(batch_cart.email)))
                        OR COALESCE(
                             NULLIF(batch_linked_cart.normalized_email, ''),
                             LOWER(BTRIM(batch_linked_cart.email))
                           ) = COALESCE(batch_cart.normalized_email, LOWER(BTRIM(batch_cart.email)))
                      )
                    )
                  )
                )
              )
         )
       ORDER BY batch_cart.last_activity_at ASC, batch_cart.created_at ASC, batch_cart.id ASC
       LIMIT ${CART_STATE_BATCH_SIZE}
       FOR UPDATE SKIP LOCKED
    ), matched AS (
      SELECT cart.id AS cart_id, order_row.id AS order_id,
             CASE
               WHEN LOWER(BTRIM(COALESCE(order_row.status, ''))) = 'pending'
                AND (
                  NULLIF(BTRIM(to_jsonb(order_row)->>'paypal_capture_id'), '') IS NOT NULL
                  OR (
                    LOWER(BTRIM(COALESCE(to_jsonb(order_row)->>'payment_method', ''))) = 'paypal'
                    AND LOWER(BTRIM(COALESCE(to_jsonb(order_row)->>'payment_reconciliation_status', ''))) = 'complete'
                  )
                ) THEN 'paid'
               ELSE LOWER(BTRIM(COALESCE(order_row.status, '')))
             END AS order_status,
             order_row.created_at AS order_created_at,
             CASE
               WHEN linked_cart.id IS NOT NULL THEN linked_cart.id
               WHEN NULLIF(BTRIM(order_row.abandoned_cart_session_id), '') IS NOT NULL THEN (
                 SELECT candidate.id
                   FROM abandoned_carts AS candidate
                  WHERE candidate.recovery_status IN ('active', 'abandoned')
                    AND candidate.session_id = NULLIF(BTRIM(order_row.abandoned_cart_session_id), '')
                    AND candidate.created_at <= order_row.created_at + INTERVAL '10 minutes'
                    AND candidate.last_activity_at >= order_row.created_at - INTERVAL '30 minutes'
                    AND candidate.last_activity_at <= order_row.created_at + INTERVAL '10 minutes'
                  ORDER BY candidate.last_activity_at DESC, candidate.created_at DESC, candidate.id DESC
                  LIMIT 1
               )
               ELSE (
                 SELECT candidate.id
                   FROM abandoned_carts AS candidate
                  WHERE candidate.recovery_status IN ('active', 'abandoned')
                    AND candidate.created_at <= order_row.created_at
                    AND candidate.last_activity_at <= order_row.created_at
                    AND order_row.created_at <= candidate.last_activity_at + INTERVAL '96 hours'
                    AND (
                      (candidate.user_id IS NOT NULL AND candidate.user_id = order_row.user_id)
                      OR (
                        NULLIF(COALESCE(candidate.normalized_email, LOWER(BTRIM(candidate.email))), '') IS NOT NULL
                        AND COALESCE(candidate.normalized_email, LOWER(BTRIM(candidate.email))) = LOWER(BTRIM(order_row.email))
                      )
                    )
                  ORDER BY candidate.last_activity_at DESC, candidate.created_at DESC, candidate.id DESC
                  LIMIT 1
               )
             END AS recovery_target_id
        FROM cart_batch
        JOIN abandoned_carts AS cart ON cart.id = cart_batch.id
        JOIN orders AS order_row
          ON (
               order_row.status IN ('paid', 'in_production', 'shipped', 'delivered', 'fulfilled', 'refunded')
               OR (
                 LOWER(BTRIM(COALESCE(order_row.status, ''))) = 'pending'
                 AND (
                   NULLIF(BTRIM(to_jsonb(order_row)->>'paypal_capture_id'), '') IS NOT NULL
                   OR (
                     LOWER(BTRIM(COALESCE(to_jsonb(order_row)->>'payment_method', ''))) = 'paypal'
                     AND LOWER(BTRIM(COALESCE(to_jsonb(order_row)->>'payment_reconciliation_status', ''))) = 'complete'
                   )
                 )
               )
             )
         AND COALESCE(order_row.is_test_order, FALSE) = FALSE
         AND (
           to_jsonb(order_row)->>'abandoned_cart_id' = cart.id::text
           OR (
             NULLIF(to_jsonb(order_row)->>'abandoned_cart_id', '') IS NOT NULL
             AND cart.created_at <= order_row.created_at
             AND order_row.created_at <= cart.last_activity_at + INTERVAL '96 hours'
           )
           OR (
             NULLIF(BTRIM(order_row.abandoned_cart_session_id), '') IS NULL
             AND cart.created_at <= order_row.created_at
             AND order_row.created_at <= cart.last_activity_at + INTERVAL '96 hours'
           )
           OR (
             cart.session_id IS NOT NULL
             AND cart.session_id = NULLIF(BTRIM(order_row.abandoned_cart_session_id), '')
             AND cart.created_at <= order_row.created_at + INTERVAL '10 minutes'
             AND cart.last_activity_at >= order_row.created_at - INTERVAL '30 minutes'
             AND cart.last_activity_at <= order_row.created_at + INTERVAL '10 minutes'
           )
         )
        LEFT JOIN abandoned_carts AS linked_cart
          ON linked_cart.id::text = NULLIF(to_jsonb(order_row)->>'abandoned_cart_id', '')
       WHERE cart.recovery_status IN ('active', 'abandoned')
         AND (
           to_jsonb(order_row)->>'abandoned_cart_id' = cart.id::text
           OR (
             NULLIF(to_jsonb(order_row)->>'abandoned_cart_id', '') IS NULL
             AND (
               (
                 cart.session_id IS NOT NULL
                 AND cart.session_id = NULLIF(BTRIM(order_row.abandoned_cart_session_id), '')
                 AND cart.created_at <= order_row.created_at + INTERVAL '10 minutes'
                 AND cart.last_activity_at >= order_row.created_at - INTERVAL '30 minutes'
                 AND cart.last_activity_at <= order_row.created_at + INTERVAL '10 minutes'
               )
               OR (
                 NULLIF(BTRIM(order_row.abandoned_cart_session_id), '') IS NULL
                 AND
                 cart.last_activity_at <= order_row.created_at
                 AND order_row.created_at <= cart.last_activity_at + INTERVAL '96 hours'
                 AND (
                   (cart.user_id IS NOT NULL AND order_row.user_id = cart.user_id)
                   OR (
                     NULLIF(COALESCE(cart.normalized_email, LOWER(BTRIM(cart.email))), '') IS NOT NULL
                     AND LOWER(BTRIM(order_row.email)) =
                         COALESCE(cart.normalized_email, LOWER(BTRIM(cart.email)))
                   )
                 )
               )
             )
           )
           OR (
             NULLIF(to_jsonb(order_row)->>'abandoned_cart_id', '') IS NOT NULL
             AND to_jsonb(order_row)->>'abandoned_cart_id' <> cart.id::text
             AND cart.last_activity_at <= order_row.created_at
             AND order_row.created_at <= cart.last_activity_at + INTERVAL '96 hours'
             AND (
               (
                 cart.user_id IS NOT NULL
                 AND (order_row.user_id = cart.user_id OR linked_cart.user_id = cart.user_id)
               )
               OR (cart.session_id IS NOT NULL AND linked_cart.session_id = cart.session_id)
               OR (
                 NULLIF(COALESCE(cart.normalized_email, LOWER(BTRIM(cart.email))), '') IS NOT NULL
                 AND (
                   LOWER(BTRIM(order_row.email)) =
                       COALESCE(cart.normalized_email, LOWER(BTRIM(cart.email)))
                   OR COALESCE(NULLIF(linked_cart.normalized_email, ''), LOWER(BTRIM(linked_cart.email))) =
                      COALESCE(cart.normalized_email, LOWER(BTRIM(cart.email)))
                 )
               )
             )
           )
         )
    ), targets AS (
      SELECT DISTINCT ON (cart_id) cart_id, order_id, order_status,
             cart_id = recovery_target_id AS recovery_target
        FROM matched
       ORDER BY cart_id,
                (cart_id = recovery_target_id) DESC NULLS LAST,
                (order_status = 'refunded') ASC,
                order_created_at ASC,
                order_id
    ), settled AS (
      UPDATE abandoned_carts AS cart
         SET recovery_status = CASE
               WHEN targets.recovery_target AND targets.order_status <> 'refunded' THEN 'recovered'
               ELSE 'expired'
             END,
             recovered_at = CASE
               WHEN targets.recovery_target AND targets.order_status <> 'refunded'
                 THEN COALESCE(cart.recovered_at, NOW())
               ELSE cart.recovered_at
             END,
             recovered_order_id = CASE
               WHEN targets.recovery_target AND targets.order_status <> 'refunded'
                 THEN COALESCE(cart.recovered_order_id, targets.order_id::text)
               ELSE cart.recovered_order_id
             END,
             recovery_email_claim_sequence = NULL, recovery_email_claimed_at = NULL,
             recovery_email_last_error = NULL, updated_at = NOW()
        FROM targets
       WHERE cart.id = targets.cart_id
         AND cart.recovery_status IN ('active', 'abandoned')
       RETURNING cart.id, targets.order_id, targets.order_status, targets.recovery_target
    ), linked_orders AS (
      UPDATE orders AS order_row
         SET abandoned_cart_id = COALESCE(order_row.abandoned_cart_id, settled.id), updated_at = NOW()
        FROM settled
       WHERE settled.recovery_target
         AND settled.order_status <> 'refunded'
         AND order_row.id = settled.order_id
         AND (order_row.abandoned_cart_id IS NULL OR order_row.abandoned_cart_id = settled.id)
       RETURNING order_row.id
    ), recovery_logs AS (
      INSERT INTO cart_recovery_logs (abandoned_cart_id, event_type, metadata, created_at)
      SELECT settled.id, 'cart_recovered',
             jsonb_build_object('orderId', settled.order_id), NOW()
        FROM settled
       WHERE settled.recovery_target
         AND settled.order_status <> 'refunded'
         AND NOT EXISTS (
         SELECT 1 FROM cart_recovery_logs AS existing
          WHERE existing.abandoned_cart_id = settled.id
            AND existing.event_type = 'cart_recovered'
            AND existing.metadata->>'orderId' = settled.order_id::text
       )
      RETURNING abandoned_cart_id
    ), skipped_deliveries AS (
      UPDATE cart_recovery_deliveries AS delivery
         SET status = 'skipped',
             failure_reason = CASE
               WHEN settled.order_status = 'refunded' THEN 'completed_order_refunded'
               WHEN settled.recovery_target THEN 'completed_order'
               ELSE 'completed_order_other_cart'
             END,
             updated_at = NOW()
        FROM settled
       WHERE delivery.abandoned_cart_id = settled.id
         AND delivery.status = 'claimed'
       RETURNING delivery.abandoned_cart_id
    )
    SELECT id FROM settled
  `;
}

async function abandonInactiveCarts(sql) {
  return sql`
    WITH candidates AS (
      SELECT id
        FROM abandoned_carts
       WHERE recovery_status = 'active'
         AND last_activity_at <= NOW() - INTERVAL '1 hour'
         AND last_activity_at > NOW() - INTERVAL '96 hours'
         AND COALESCE(estimated_total_cents, ROUND(total_value * 100)::integer, 0) > 0
       ORDER BY last_activity_at ASC, id
       LIMIT ${CART_STATE_BATCH_SIZE}
       FOR UPDATE SKIP LOCKED
    )
    UPDATE abandoned_carts AS cart
       SET recovery_status = 'abandoned',
           abandoned_at = COALESCE(cart.abandoned_at, cart.last_activity_at + INTERVAL '1 hour'),
           updated_at = NOW()
      FROM candidates
     WHERE cart.id = candidates.id
       AND cart.recovery_status = 'active'
       AND cart.last_activity_at <= NOW() - INTERVAL '1 hour'
       AND cart.last_activity_at > NOW() - INTERVAL '96 hours'
     RETURNING cart.id, NULLIF(BTRIM(cart.email), '') AS email
  `;
}

async function expireStaleActiveCarts(sql) {
  return sql`
    WITH stale AS (
      SELECT id
        FROM abandoned_carts
       WHERE recovery_status = 'active'
         AND last_activity_at <= NOW() - INTERVAL '96 hours'
       ORDER BY last_activity_at ASC, id
       LIMIT ${CART_STATE_BATCH_SIZE}
       FOR UPDATE SKIP LOCKED
    )
    UPDATE abandoned_carts AS cart
       SET recovery_status = 'expired', recovery_email_claim_sequence = NULL,
           recovery_email_claimed_at = NULL, updated_at = NOW()
      FROM stale
     WHERE cart.id = stale.id
       AND cart.recovery_status = 'active'
       AND cart.last_activity_at <= NOW() - INTERVAL '96 hours'
     RETURNING cart.id
  `;
}

async function expireAbandonedCarts(sql) {
  return sql`
    WITH stale AS (
      SELECT id
        FROM abandoned_carts
       WHERE recovery_status = 'abandoned'
         AND COALESCE(abandoned_at, last_activity_at) <= NOW() - INTERVAL '96 hours'
       ORDER BY COALESCE(abandoned_at, last_activity_at) ASC, id
       LIMIT ${CART_STATE_BATCH_SIZE}
       FOR UPDATE SKIP LOCKED
    )
    UPDATE abandoned_carts AS cart
       SET recovery_status = 'expired', recovery_email_claim_sequence = NULL,
           recovery_email_claimed_at = NULL, updated_at = NOW()
      FROM stale
     WHERE cart.id = stale.id
       AND cart.recovery_status = 'abandoned'
       AND COALESCE(cart.abandoned_at, cart.last_activity_at) <= NOW() - INTERVAL '96 hours'
     RETURNING cart.id
  `;
}

async function supersedeDuplicateRecipientCarts(sql) {
  return sql`
    WITH recipient_groups AS (
      SELECT candidate.recipient
        FROM (
          SELECT COALESCE(NULLIF(normalized_email, ''), LOWER(BTRIM(email))) AS recipient,
                 last_activity_at
            FROM abandoned_carts
           WHERE recovery_status IN ('active', 'abandoned')
             AND NULLIF(COALESCE(normalized_email, LOWER(BTRIM(email))), '') IS NOT NULL
        ) AS candidate
       GROUP BY candidate.recipient
      HAVING COUNT(*) > 1
       ORDER BY MAX(candidate.last_activity_at) DESC, candidate.recipient
       LIMIT ${RECIPIENT_GROUP_BATCH_SIZE}
    ), ranked AS (
      SELECT cart.id, cart.last_activity_at, cart.created_at,
             cart.recovery_email_claim_sequence, cart.recovery_email_claimed_at,
             ROW_NUMBER() OVER (
               PARTITION BY groups.recipient
               ORDER BY cart.last_activity_at DESC, cart.created_at DESC, cart.id DESC
             ) AS recipient_rank,
             MAX(COALESCE(cart.recovery_emails_sent, 0)) OVER (
               PARTITION BY groups.recipient
             ) AS recipient_emails_sent,
             MAX(cart.last_recovery_email_at) OVER (
               PARTITION BY groups.recipient
             ) AS recipient_last_email_at
        FROM abandoned_carts AS cart
        JOIN recipient_groups AS groups
          ON COALESCE(NULLIF(cart.normalized_email, ''), LOWER(BTRIM(cart.email))) = groups.recipient
       WHERE cart.recovery_status IN ('active', 'abandoned')
    ), winner_progress AS (
      UPDATE abandoned_carts AS winner
         SET recovery_emails_sent = GREATEST(
               COALESCE(winner.recovery_emails_sent, 0), ranked.recipient_emails_sent
             ),
             last_recovery_email_at = CASE
               WHEN ranked.recipient_last_email_at IS NULL THEN winner.last_recovery_email_at
               WHEN winner.last_recovery_email_at IS NULL THEN ranked.recipient_last_email_at
               ELSE GREATEST(winner.last_recovery_email_at, ranked.recipient_last_email_at)
             END
        FROM ranked
       WHERE ranked.recipient_rank = 1
         AND winner.id = ranked.id
       RETURNING winner.id
    ), stale_candidates AS (
      SELECT ranked.id
        FROM ranked
       WHERE ranked.recipient_rank > 1
         AND (
           ranked.recovery_email_claim_sequence IS NULL
           OR ranked.recovery_email_claimed_at < NOW() - INTERVAL '20 minutes'
         )
       ORDER BY ranked.last_activity_at ASC, ranked.created_at ASC, ranked.id ASC
       LIMIT ${CART_STATE_BATCH_SIZE}
    ), superseded AS (
      UPDATE abandoned_carts AS cart
         SET recovery_status = 'expired', recovery_email_claim_sequence = NULL,
             recovery_email_claimed_at = NULL, recovery_email_last_error = NULL,
             updated_at = NOW()
        FROM stale_candidates
       WHERE cart.id = stale_candidates.id
         AND cart.recovery_status IN ('active', 'abandoned')
       RETURNING cart.id
    ), skipped_deliveries AS (
      UPDATE cart_recovery_deliveries AS delivery
         SET status = 'skipped', failure_reason = 'superseded_recipient_cart', updated_at = NOW()
       WHERE delivery.abandoned_cart_id IN (SELECT id FROM superseded)
         AND delivery.status = 'claimed'
       RETURNING delivery.abandoned_cart_id
    )
    SELECT id FROM superseded
  `;
}

async function dueCandidates(sql, sequenceNumber) {
  if (sequenceNumber === 1) {
    return sql`
      SELECT cart.id FROM abandoned_carts AS cart
      LEFT JOIN cart_recovery_deliveries AS delivery
        ON delivery.abandoned_cart_id = cart.id
       AND delivery.sequence_number = 1
       WHERE cart.recovery_status = 'abandoned'
         AND cart.recovery_emails_sent = 0
         AND cart.last_activity_at <= NOW() - INTERVAL '1 hour'
         AND COALESCE(cart.abandoned_at, cart.last_activity_at) > NOW() - INTERVAL '96 hours'
         AND NULLIF(BTRIM(cart.email), '') IS NOT NULL
         AND cart.recovery_suppressed_at IS NULL
         AND (
           delivery.id IS NULL
           OR (
             delivery.status = 'failed'
             AND delivery.updated_at <= NOW() - (${DELIVERY_RETRY_BACKOFF_HOURS} * INTERVAL '1 hour')
           )
           OR (
             delivery.status = 'claimed'
             AND delivery.claimed_at < NOW() - (${CLAIM_STALE_MINUTES} * INTERVAL '1 minute')
           )
         )
         AND cart.id = (
           SELECT candidate.id
             FROM abandoned_carts AS candidate
            WHERE candidate.recovery_status IN ('active', 'abandoned')
              AND COALESCE(NULLIF(candidate.normalized_email, ''), LOWER(BTRIM(candidate.email))) =
                  COALESCE(NULLIF(cart.normalized_email, ''), LOWER(BTRIM(cart.email)))
            ORDER BY candidate.last_activity_at DESC, candidate.created_at DESC, candidate.id DESC
            LIMIT 1
         )
         AND NOT EXISTS (
           SELECT 1
             FROM abandoned_carts AS newer_active
            WHERE newer_active.id <> cart.id
              AND newer_active.recovery_status = 'active'
              AND (
                (cart.user_id IS NOT NULL AND newer_active.user_id = cart.user_id)
                OR (cart.session_id IS NOT NULL AND newer_active.session_id = cart.session_id)
              )
              AND (newer_active.last_activity_at, newer_active.created_at, newer_active.id) >
                  (cart.last_activity_at, cart.created_at, cart.id)
         )
       ORDER BY (delivery.id IS NULL) DESC,
                CASE WHEN delivery.id IS NULL THEN cart.last_activity_at ELSE delivery.updated_at END ASC,
                cart.id
       LIMIT ${DELIVERY_BATCH_SIZE}
    `;
  }
  if (sequenceNumber === 2) {
    return sql`
      SELECT cart.id FROM abandoned_carts AS cart
      LEFT JOIN cart_recovery_deliveries AS delivery
        ON delivery.abandoned_cart_id = cart.id
       AND delivery.sequence_number = 2
       WHERE cart.recovery_status = 'abandoned'
         AND cart.recovery_emails_sent = 1
         AND cart.abandoned_at <= NOW() - INTERVAL '24 hours'
         AND cart.abandoned_at > NOW() - INTERVAL '96 hours'
         AND cart.last_recovery_email_at IS NOT NULL
         AND cart.last_recovery_email_at <= NOW() - INTERVAL '23 hours'
         AND NULLIF(BTRIM(cart.email), '') IS NOT NULL
         AND cart.recovery_suppressed_at IS NULL
         AND (
           delivery.id IS NULL
           OR (
             delivery.status = 'failed'
             AND delivery.updated_at <= NOW() - (${DELIVERY_RETRY_BACKOFF_HOURS} * INTERVAL '1 hour')
           )
           OR (
             delivery.status = 'claimed'
             AND delivery.claimed_at < NOW() - (${CLAIM_STALE_MINUTES} * INTERVAL '1 minute')
           )
         )
         AND cart.id = (
           SELECT candidate.id
             FROM abandoned_carts AS candidate
            WHERE candidate.recovery_status IN ('active', 'abandoned')
              AND COALESCE(NULLIF(candidate.normalized_email, ''), LOWER(BTRIM(candidate.email))) =
                  COALESCE(NULLIF(cart.normalized_email, ''), LOWER(BTRIM(cart.email)))
            ORDER BY candidate.last_activity_at DESC, candidate.created_at DESC, candidate.id DESC
            LIMIT 1
         )
         AND NOT EXISTS (
           SELECT 1
             FROM abandoned_carts AS newer_active
            WHERE newer_active.id <> cart.id
              AND newer_active.recovery_status = 'active'
              AND (
                (cart.user_id IS NOT NULL AND newer_active.user_id = cart.user_id)
                OR (cart.session_id IS NOT NULL AND newer_active.session_id = cart.session_id)
              )
              AND (newer_active.last_activity_at, newer_active.created_at, newer_active.id) >
                  (cart.last_activity_at, cart.created_at, cart.id)
         )
         AND NOT EXISTS (
           SELECT 1 FROM cart_recovery_logs AS log
            WHERE log.abandoned_cart_id = cart.id AND log.event_type = 'email_clicked'
         )
       ORDER BY (delivery.id IS NULL) DESC,
                CASE WHEN delivery.id IS NULL THEN cart.abandoned_at ELSE delivery.updated_at END ASC,
                cart.id
       LIMIT ${DELIVERY_BATCH_SIZE}
    `;
  }
  return sql`
    SELECT cart.id FROM abandoned_carts AS cart
    LEFT JOIN cart_recovery_deliveries AS delivery
      ON delivery.abandoned_cart_id = cart.id
     AND delivery.sequence_number = 3
     WHERE cart.recovery_status = 'abandoned'
       AND cart.recovery_emails_sent = 2
       AND cart.abandoned_at <= NOW() - INTERVAL '72 hours'
       AND cart.abandoned_at > NOW() - INTERVAL '96 hours'
       AND cart.last_recovery_email_at IS NOT NULL
       AND cart.last_recovery_email_at <= NOW() - INTERVAL '48 hours'
       AND NULLIF(BTRIM(cart.email), '') IS NOT NULL
       AND cart.recovery_suppressed_at IS NULL
       AND (
         delivery.id IS NULL
         OR (
           delivery.status = 'failed'
           AND delivery.updated_at <= NOW() - (${DELIVERY_RETRY_BACKOFF_HOURS} * INTERVAL '1 hour')
         )
         OR (
           delivery.status = 'claimed'
           AND delivery.claimed_at < NOW() - (${CLAIM_STALE_MINUTES} * INTERVAL '1 minute')
         )
       )
       AND cart.id = (
         SELECT candidate.id
           FROM abandoned_carts AS candidate
          WHERE candidate.recovery_status IN ('active', 'abandoned')
            AND COALESCE(NULLIF(candidate.normalized_email, ''), LOWER(BTRIM(candidate.email))) =
                COALESCE(NULLIF(cart.normalized_email, ''), LOWER(BTRIM(cart.email)))
          ORDER BY candidate.last_activity_at DESC, candidate.created_at DESC, candidate.id DESC
          LIMIT 1
       )
       AND NOT EXISTS (
         SELECT 1
           FROM abandoned_carts AS newer_active
          WHERE newer_active.id <> cart.id
            AND newer_active.recovery_status = 'active'
            AND (
              (cart.user_id IS NOT NULL AND newer_active.user_id = cart.user_id)
              OR (cart.session_id IS NOT NULL AND newer_active.session_id = cart.session_id)
            )
            AND (newer_active.last_activity_at, newer_active.created_at, newer_active.id) >
                (cart.last_activity_at, cart.created_at, cart.id)
       )
       AND NOT EXISTS (
         SELECT 1 FROM cart_recovery_logs AS log
          WHERE log.abandoned_cart_id = cart.id AND log.event_type = 'email_clicked'
       )
     ORDER BY (delivery.id IS NULL) DESC,
              CASE WHEN delivery.id IS NULL THEN cart.abandoned_at ELSE delivery.updated_at END ASC,
              cart.id
     LIMIT ${DELIVERY_BATCH_SIZE}
  `;
}

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await worker(items[index]);
      } catch (error) {
        results[index] = { success: false, failed: true, error };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

function deliverySummary(results) {
  return results.reduce((summary, result) => {
    if (result?.success) summary.sent += 1;
    else if (result?.skipped) summary.skipped += 1;
    else summary.failed += 1;
    return summary;
  }, { sent: 0, skipped: 0, failed: 0 });
}

function takeUnattemptedCandidates(candidates, attemptedCartIds) {
  return candidates.filter((cart) => {
    const cartId = String(cart?.id || '');
    if (!cartId || attemptedCartIds.has(cartId)) return false;
    attemptedCartIds.add(cartId);
    return true;
  });
}

async function deliverDue(sql, resend, candidates, sequenceNumber, options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const deadlineAtMs = Number.isFinite(options.deadlineAtMs) ? options.deadlineAtMs : Infinity;
  const results = await runWithConcurrency(candidates, 5, async (cart) => {
    if (deadlineAtMs - now() < DELIVERY_START_BUFFER_MS) {
      return { success: false, skipped: true, reason: 'worker_deadline' };
    }
    try {
      return await deliverRecoveryEmail({
        sql,
        resend,
        cartId: cart.id,
        sequenceNumber,
        source: 'scheduled',
      });
    } catch (error) {
      console.error('[detect-abandoned-carts] recovery delivery failed', {
        cartId: cart.id,
        sequenceNumber,
        code: error?.code || null,
        message: error?.message || String(error),
      });
      return { success: false, failed: true };
    }
  });
  return deliverySummary(results);
}

function roundRobinCandidates(sequenceQueues) {
  const work = [];
  const maxLength = Math.max(0, ...sequenceQueues.map((queue) => queue.candidates.length));
  for (let index = 0; index < maxLength; index += 1) {
    for (const queue of sequenceQueues) {
      const cart = queue.candidates[index];
      if (cart) work.push({ cart, sequenceNumber: queue.sequenceNumber });
    }
  }
  return work;
}

async function deliverFairDue(sql, resend, sequenceQueues, options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const deadlineAtMs = Number.isFinite(options.deadlineAtMs) ? options.deadlineAtMs : Infinity;
  const work = roundRobinCandidates(sequenceQueues);
  const results = await runWithConcurrency(work, 5, async ({ cart, sequenceNumber }) => {
    if (deadlineAtMs - now() < DELIVERY_START_BUFFER_MS) {
      return { sequenceNumber, result: { success: false, skipped: true, reason: 'worker_deadline' } };
    }
    try {
      const result = await deliverRecoveryEmail({
        sql,
        resend,
        cartId: cart.id,
        sequenceNumber,
        source: 'scheduled',
      });
      return { sequenceNumber, result };
    } catch (error) {
      console.error('[detect-abandoned-carts] recovery delivery failed', {
        cartId: cart.id,
        sequenceNumber,
        code: error?.code || null,
        message: error?.message || String(error),
      });
      return { sequenceNumber, result: { success: false, failed: true } };
    }
  });

  const summaries = new Map(sequenceQueues.map((queue) => [
    queue.sequenceNumber,
    { sent: 0, skipped: 0, failed: 0 },
  ]));
  for (const entry of results) {
    if (!entry) continue;
    const summary = summaries.get(entry.sequenceNumber);
    if (entry.result?.success) summary.sent += 1;
    else if (entry.result?.skipped) summary.skipped += 1;
    else summary.failed += 1;
  }
  return summaries;
}

async function acquireRecoveryWorkerLease(sql, ownerToken) {
  const rows = await sql`
    INSERT INTO recovery_job_leases (
      job_name, lease_owner, lease_expires_at, created_at, updated_at
    ) VALUES (
      ${WORKER_JOB_NAME}, ${ownerToken},
      NOW() + (${WORKER_LEASE_MINUTES} * INTERVAL '1 minute'), NOW(), NOW()
    )
    ON CONFLICT (job_name) DO UPDATE
      SET lease_owner = EXCLUDED.lease_owner,
          lease_expires_at = EXCLUDED.lease_expires_at,
          updated_at = NOW()
      WHERE recovery_job_leases.lease_expires_at IS NULL
         OR recovery_job_leases.lease_expires_at < NOW()
         OR recovery_job_leases.lease_owner = EXCLUDED.lease_owner
    RETURNING job_name
  `;
  return rows.length > 0;
}

async function releaseRecoveryWorkerLease(sql, ownerToken) {
  return sql`
    UPDATE recovery_job_leases
       SET lease_owner = NULL, lease_expires_at = NULL, updated_at = NOW()
     WHERE job_name = ${WORKER_JOB_NAME}
       AND lease_owner = ${ownerToken}
     RETURNING job_name
  `;
}

async function runRecoveryScan({ sql, resend, deadlineAtMs, now = Date.now }) {
  const recovered = await settleCompletedCarts(sql);
  const staleActiveExpired = await expireStaleActiveCarts(sql);
  const duplicateRecipientCartsExpired = await supersedeDuplicateRecipientCarts(sql);
  const newlyAbandoned = await abandonInactiveCarts(sql);
  const expired = await expireAbandonedCarts(sql);
  const attemptedCartIds = new Set();
  const deliveryOptions = { deadlineAtMs, now };

  const sequence1 = takeUnattemptedCandidates(await dueCandidates(sql, 1), attemptedCartIds);
  const sequence2 = takeUnattemptedCandidates(await dueCandidates(sql, 2), attemptedCartIds);
  const sequence3 = takeUnattemptedCandidates(await dueCandidates(sql, 3), attemptedCartIds);
  const deliverySummaries = await deliverFairDue(sql, resend, [
    { sequenceNumber: 1, candidates: sequence1 },
    { sequenceNumber: 2, candidates: sequence2 },
    { sequenceNumber: 3, candidates: sequence3 },
  ], deliveryOptions);
  return {
    recoveredBeforeSend: recovered.length,
    staleActiveExpired: staleActiveExpired.length,
    duplicateRecipientCartsExpired: duplicateRecipientCartsExpired.length,
    newlyAbandoned: newlyAbandoned.length,
    newlyAbandonedWithoutEmail: newlyAbandoned.filter((cart) => !cart.email).length,
    email1: deliverySummaries.get(1),
    email2: deliverySummaries.get(2),
    email3: deliverySummaries.get(3),
    expired: expired.length,
    timestamp: new Date(now()).toISOString(),
  };
}

async function runLeasedRecoveryWorker({ sql, resend, ownerToken, deadlineAtMs, now = Date.now }) {
  await ensureSchema(sql);
  if (!await acquireRecoveryWorkerLease(sql, ownerToken)) {
    return { success: true, skipped: true, reason: 'worker_lease_held' };
  }
  try {
    const summary = await runRecoveryScan({ sql, resend, deadlineAtMs, now });
    return { success: true, ...summary };
  } finally {
    await releaseRecoveryWorkerLease(sql, ownerToken);
  }
}

async function runConfiguredRecoveryWorker(options = {}) {
  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || process.env.VITE_DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_NOT_CONFIGURED');
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_NOT_CONFIGURED');
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const ownerToken = String(options.ownerToken || randomUUID());
  const deadlineAtMs = Number.isFinite(options.deadlineAtMs)
    ? options.deadlineAtMs
    : now() + WORKER_SOFT_LIMIT_MS;
  return runLeasedRecoveryWorker({
    sql: neonFactory(dbUrl),
    resend: resendFactory(process.env.RESEND_API_KEY),
    ownerToken,
    deadlineAtMs,
    now,
  });
}

async function handler() {
  console.log('[detect-abandoned-carts] scheduled recovery scan started');
  try {
    const summary = await runConfiguredRecoveryWorker();
    console.log('[detect-abandoned-carts] scheduled recovery scan finished', summary);
    return { statusCode: 200, body: JSON.stringify(summary) };
  } catch (error) {
    console.error('[detect-abandoned-carts] fatal error', {
      code: error?.code || null,
      message: error?.message || String(error),
    });
    return { statusCode: 500, body: JSON.stringify({ error: 'RECOVERY_SCAN_FAILED' }) };
  }
}

exports.handler = handler;
exports.runConfiguredRecoveryWorker = runConfiguredRecoveryWorker;
exports._test = {
  acquireRecoveryWorkerLease,
  abandonInactiveCarts,
  CART_STATE_BATCH_SIZE,
  DELIVERY_BATCH_SIZE,
  DELIVERY_RETRY_BACKOFF_HOURS,
  DELIVERY_START_BUFFER_MS,
  deliverySummary,
  deliverFairDue,
  deliverDue,
  dueCandidates,
  expireAbandonedCarts,
  expireStaleActiveCarts,
  RECIPIENT_GROUP_BATCH_SIZE,
  releaseRecoveryWorkerLease,
  roundRobinCandidates,
  runConfiguredRecoveryWorker,
  runLeasedRecoveryWorker,
  runRecoveryScan,
  runWithConcurrency,
  settleCompletedCarts,
  supersedeDuplicateRecipientCarts,
  takeUnattemptedCandidates,
  WORKER_JOB_NAME,
  WORKER_LEASE_MINUTES,
  WORKER_SOFT_LIMIT_MS,
  resetDependencies() {
    neonFactory = neon;
    resendFactory = (apiKey) => new Resend(apiKey);
    ensureSchema = ensureAbandonedCartSchema;
    deliverRecoveryEmail = sendModule.deliverRecoveryEmail;
  },
  setDelivery(value) { deliverRecoveryEmail = value; },
  setEnsureSchema(value) { ensureSchema = value; },
  setNeonFactory(value) { neonFactory = value; },
  setResendFactory(value) { resendFactory = value; },
};
