import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';

const require = createRequire(import.meta.url);
const { _test: detector } = require('../_shared/legacy/detect-abandoned-carts.cjs');

test('anonymous carts appear after inactivity without enrolling legacy carts or interrupting payment', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`CREATE TABLE abandoned_carts (
    id TEXT PRIMARY KEY, email TEXT, normalized_email TEXT,
    snapshot_revision BIGINT, recovery_status TEXT DEFAULT 'active',
    checkout_stage TEXT DEFAULT 'cart', total_value NUMERIC DEFAULT 90,
    estimated_total_cents INTEGER, abandonment_signaled_at TIMESTAMPTZ,
    first_recovery_due_at TIMESTAMPTZ, abandoned_at TIMESTAMPTZ,
    last_activity_at TIMESTAMPTZ, updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  INSERT INTO abandoned_carts (id, snapshot_revision, last_activity_at) VALUES
    ('anonymous-idle', 1, NOW() - INTERVAL '31 minutes'),
    ('anonymous-browsing', 2, NOW() - INTERVAL '5 minutes'),
    ('legacy-anonymous', NULL, NOW() - INTERVAL '1 hour'),
    ('payment-in-progress', 3, NOW() - INTERVAL '10 minutes'),
    ('completed', 4, NOW() - INTERVAL '1 hour'),
    ('legacy-email', NULL, NOW() - INTERVAL '1 hour'),
    ('email-due', 5, NOW() - INTERVAL '4 minutes'),
    ('normalized-email-only', 6, NOW() - INTERVAL '1 hour');
  UPDATE abandoned_carts SET checkout_stage='payment_started' WHERE id='payment-in-progress';
  UPDATE abandoned_carts SET recovery_status='recovered' WHERE id='completed';
  UPDATE abandoned_carts SET email='buyer@example.com' WHERE id IN ('legacy-email','email-due');
  UPDATE abandoned_carts SET normalized_email='buyer@example.com' WHERE id='normalized-email-only';
  UPDATE abandoned_carts SET first_recovery_due_at=NOW() - INTERVAL '1 minute' WHERE id='email-due';`);

  const sql = async (strings, ...values) => {
    const query = strings.reduce((text, part, index) => text + (index ? `$${index}` : '') + part, '');
    return (await db.query(query, values)).rows;
  };
  const changed = await detector.abandonInactiveCarts(sql);
  assert.deepEqual(changed.map(row => row.id).sort(), ['anonymous-idle', 'email-due']);
  const { rows } = await db.query(`SELECT *,
    EXTRACT(EPOCH FROM abandoned_at - last_activity_at) AS timeout_seconds
    FROM abandoned_carts ORDER BY id`);
  const anonymous = rows.find(row => row.id === 'anonymous-idle');
  assert.equal(Number(anonymous.timeout_seconds), 1800);
  assert.equal(anonymous.email, null);
  assert.equal(anonymous.first_recovery_due_at, null);
  assert.equal(anonymous.abandonment_signaled_at, null);
  for (const id of ['anonymous-browsing', 'legacy-anonymous', 'payment-in-progress', 'legacy-email', 'normalized-email-only']) {
    assert.equal(rows.find(row => row.id === id).recovery_status, 'active');
  }
  assert.equal(rows.find(row => row.id === 'completed').recovery_status, 'recovered');
  assert.deepEqual(await detector.abandonInactiveCarts(sql), []);
});
