import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';

const require = createRequire(import.meta.url);
const sendModule = require('../_shared/legacy/send-abandoned-cart-email.cjs');

const CART_ID = '11111111-1111-4111-8111-111111111111';

function pgliteSql(db) {
  return async (strings, ...values) => {
    let query = strings[0];
    for (let index = 0; index < values.length; index += 1) {
      query += `$${index + 1}${strings[index + 1]}`;
    }
    return (await db.query(query, values)).rows;
  };
}

test('claimSequence parses and executes its delivery upsert against PostgreSQL', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());

  await db.exec(`
    CREATE TABLE abandoned_carts (
      id UUID PRIMARY KEY,
      user_id UUID,
      session_id TEXT,
      email TEXT,
      normalized_email TEXT,
      recovery_status TEXT NOT NULL,
      recovery_emails_sent INTEGER NOT NULL DEFAULT 0,
      recovery_email_claim_sequence SMALLINT,
      recovery_email_claimed_at TIMESTAMPTZ,
      recovery_email_last_error TEXT,
      recovery_suppressed_at TIMESTAMPTZ,
      last_recovery_email_at TIMESTAMPTZ,
      last_activity_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE cart_recovery_deliveries (
      abandoned_cart_id UUID NOT NULL,
      sequence_number SMALLINT NOT NULL,
      status TEXT NOT NULL,
      claimed_at TIMESTAMPTZ NOT NULL,
      failure_reason TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      discount_code TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (abandoned_cart_id, sequence_number)
    );

    INSERT INTO abandoned_carts (
      id, session_id, email, normalized_email, recovery_status,
      last_activity_at, created_at
    ) VALUES (
      '${CART_ID}', 'claim-sql-session', 'buyer@example.com',
      'buyer@example.com', 'abandoned', NOW() - INTERVAL '1 hour',
      NOW() - INTERVAL '2 hours'
    );
  `);

  const sql = pgliteSql(db);
  const initialClaim = await sendModule._test.claimSequence(
    sql,
    CART_ID,
    1,
    'admin:sql-regression',
  );

  assert.equal(initialClaim.id, CART_ID);
  assert.equal(initialClaim.recovery_email_claim_sequence, 1);
  assert.equal(initialClaim.recovery_delivery_metadata.attemptCount, 1);

  await db.exec(`
    UPDATE cart_recovery_deliveries
       SET status = 'failed', updated_at = NOW() - INTERVAL '10 minutes'
     WHERE abandoned_cart_id = '${CART_ID}' AND sequence_number = 1;
    UPDATE abandoned_carts
       SET recovery_email_claim_sequence = NULL, recovery_email_claimed_at = NULL
     WHERE id = '${CART_ID}';
  `);

  const retryClaim = await sendModule._test.claimSequence(
    sql,
    CART_ID,
    1,
    'admin:sql-regression',
  );

  assert.equal(retryClaim.id, CART_ID);
  assert.equal(retryClaim.recovery_delivery_metadata.attemptCount, 2);
  const delivery = (await db.query(
    `SELECT status, metadata FROM cart_recovery_deliveries
      WHERE abandoned_cart_id = $1 AND sequence_number = 1`,
    [CART_ID],
  )).rows[0];
  assert.equal(delivery.status, 'claimed');
  assert.equal(delivery.metadata.attemptCount, 2);
});
