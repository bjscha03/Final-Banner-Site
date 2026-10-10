'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const sharp = require('sharp');
const twilio = require('twilio');
const runtime = require('../_shared/sms/runtime.cjs');
const http = require('../_shared/sms/http.cjs');
const store = require('../_shared/sms/store.cjs');
const conversation = require('../_shared/sms/conversation.cjs');
const artwork = require('../_shared/sms/artwork.cjs');
const worker = require('../_shared/sms/worker.cjs');
const payments = require('../_shared/sms/payments.cjs');
const checkout = require('../_shared/stripe-checkout-service.cjs');
const preflight = require('../_shared/sms/preflight.cjs');
const { assertReadyPlacementPreview } = require('../_shared/preview-artifact.cjs');

const config = { enabled: true, accountSid: `AC${'a'.repeat(32)}`, authToken: 'test-auth-token-with-enough-characters',
  phoneNumber: '+18005550101', origin: 'https://bannersonthefly.com', mode: 'test',
  testPhones: ['+15025550100'], dailyMessages: 200, monthlyMessages: 2000, sessionMessages: 50 };
const phone = config.testPhones[0];
let sequence = 0;

test('account preflight works before a number is selected and only reads safe account metadata', async () => {
  const calls = [];
  const provider = {
    api: { accounts: sid => { assert.equal(sid, config.accountSid); return { fetch: async () => {
      calls.push('account.fetch'); return { type: 'Trial', status: 'active', authToken: config.authToken };
    } }; } },
    incomingPhoneNumbers: { list: async options => { calls.push(['numbers.list', options]); return []; } },
  };
  const report = await preflight.inspect({ ...config, phoneNumber: '', enabled: false }, () => provider);
  assert.deepEqual(calls, ['account.fetch', ['numbers.list', { limit: 20 }]]);
  assert.equal(report.status, 'connected'); assert.equal(report.accountType, 'Trial');
  assert.deepEqual(report.numbers, []); assert.equal(report.selectedNumberConfigured, false);
  assert.equal(report.routingMatches, false);
  assert.equal(JSON.stringify(report).includes(config.authToken), false);
  assert.equal(JSON.stringify(report).includes(config.accountSid), false);
});

test('preflight checks the selected owned number and routing without exposing provider URLs', async () => {
  const number = { sid: 'PN-private', phoneNumber: config.phoneNumber, capabilities: { sms: true, mms: true },
    smsUrl: `${config.origin}/api/twilio/inbound`, smsMethod: 'POST', smsFallbackUrl: 'https://private.invalid/?secret=value' };
  const provider = { api: { accounts: () => ({ fetch: async () => ({ type: 'Full', status: 'active' }) }) },
    incomingPhoneNumbers: { list: async options => { assert.deepEqual(options, { phoneNumber: config.phoneNumber, limit: 2 }); return [number]; } } };
  const report = await preflight.inspect(config, () => provider);
  assert.equal(report.selectedNumberOwned, true); assert.equal(report.selectedNumberCapable, true);
  assert.equal(report.routingMatches, true);
  assert.equal(JSON.stringify(report).includes('private'), false);
  number.smsMethod = 'GET';
  assert.equal((await preflight.inspect(config, () => provider)).routingMatches, false);
  number.phoneNumber = '+18005550199';
  assert.equal((await preflight.inspect(config, () => provider)).selectedNumberOwned, false);
});

test('preflight avoids calls for missing credentials and suppresses raw provider failures', async () => {
  const forbidden = () => { throw new Error('Network must not be called'); };
  assert.deepEqual(await preflight.inspect({ ...config, authToken: '' }, forbidden), { status: 'missing_credentials' });
  assert.deepEqual(await preflight.inspect({ ...config, accountSid: 'invalid' }, forbidden), { status: 'invalid_credentials' });
  const provider = { api: { accounts: () => ({ fetch: async () => { throw Object.assign(new Error(config.authToken), { status: 401 }); } }) } };
  assert.deepEqual(await preflight.inspect(config, () => provider), { status: 'authentication_failed' });
  provider.api.accounts = () => ({ fetch: async () => { throw new Error(`Network failure with ${config.authToken}`); } });
  assert.deepEqual(await preflight.inspect(config, () => provider), { status: 'unavailable' });
});

test('only a signed administrator can inspect Twilio; preview cookies cannot trigger provider reads', async () => {
  const { readFileSync } = require('node:fs');
  const path = require('node:path');
  const Module = require('node:module');
  const auth = require('../_shared/server-auth.cjs');
  const filename = path.resolve(__dirname, '../admin-text-orders.mts');
  const loaded = new Module(filename, module); loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(require('esbuild').transformSync(readFileSync(filename, 'utf8'), { loader: 'ts', format: 'cjs' }).code, filename);
  const handler = loaded.exports.default;
  const originalInspect = preflight.inspect; const originalSecret = process.env.AUTH_SESSION_SECRET;
  process.env.AUTH_SESSION_SECRET = 'text-order-test-admin-secret';
  let reads = 0;
  preflight.inspect = async () => { reads++; return { status: 'connected', accountType: 'Trial', numbers: [] }; };
  try {
    const url = 'https://deploy-preview-596--bannersonthefly.netlify.app/.netlify/functions/admin-text-orders?check=connection';
    const request = headers => new Request(url, { headers });
    assert.equal((await handler(request({}))).status, 401);
    assert.equal((await handler(request({ host: new URL(url).host, cookie: 'botf_preview_admin=1' }))).status, 401);
    const customer = auth.createSessionToken({ id: 'customer', email: 'customer@example.com', is_admin: false });
    assert.equal((await handler(request({ authorization: `Bearer ${customer}` }))).status, 401);
    assert.equal(reads, 0);
    const admin = auth.createSessionToken({ id: 'admin', email: 'admin@example.com', is_admin: true });
    const response = await handler(request({ authorization: `Bearer ${admin}` }));
    assert.equal(response.status, 200); assert.equal(reads, 1);
    assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
    assert.equal((await response.json()).connection.status, 'connected');
  } finally {
    preflight.inspect = originalInspect;
    if (originalSecret === undefined) delete process.env.AUTH_SESSION_SECRET; else process.env.AUTH_SESSION_SECRET = originalSecret;
  }
});
async function database() {
  const db = new PGlite();
  const sql = async (strings, ...parameters) => (await db.query(strings.reduce((query, part, index) => query + (index ? `$${index}` : '') + part, ''), parameters)).rows;
  await store.ensureSchema(sql);
  return { db, sql };
}
async function message(sql, body, extra = {}, dependencies = {}) {
  const sid = `SM${(++sequence).toString(16).padStart(32, '0')}`;
  await store.receive(sql, { sid, phone, payload: { Body: body, ...extra } });
  const claimed = await store.claimInbound(sql);
  assert.equal(claimed.sid, sid);
  await worker.processInbound(sql, claimed, config, dependencies);
  return { sid, session: await store.activeSession(sql, phone) };
}
async function configured(sql) {
  await message(sql, 'I need a banner');
  for (const reply of ['6 x 6 in', '1', '2', '1', '1', '1']) await message(sql, reply);
  const session = await store.activeSession(sql, phone);
  assert.equal(session.step, 'ARTWORK');
  return session;
}

test('webhook authentication covers every parameter, pins the origin, accepts MMS SIDs and rejects tampering', async () => {
  const params = { AccountSid: config.accountSid, To: config.phoneNumber, From: phone, Body: 'I need a banner', MessageSid: `MM${'b'.repeat(32)}`, NewProviderField: 'signed too' };
  const url = `${config.origin}/api/twilio/inbound`;
  const signature = twilio.getExpectedTwilioSignature(config.authToken, url, params);
  const request = () => new Request('https://attacker.invalid/api/twilio/inbound', { method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': signature, 'x-forwarded-host': 'attacker.invalid' }, body: new URLSearchParams(params) });
  assert.equal(runtime.verifyWebhook(request(), params, config), true);
  assert.equal(runtime.verifyWebhook(request(), { ...params, Body: 'APPROVE' }, config), false);
  assert.equal((await http.twilioRequest(request(), config)).params.Body, params.Body);
  assert.equal((await http.twilioRequest(request(), { ...config, enabled: false })).error.status, 503);
  assert.equal(artwork.isTwilioMediaUrl(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages/${params.MessageSid}/Media/ME${'c'.repeat(32)}`, config.accountSid), true);
  assert.equal(artwork.isTwilioMediaUrl('https://localhost/private', config.accountSid), false);
});

test('expiring bearer and worker tokens reject changes; test recipients and SMS segment costs are constrained', () => {
  const session = { id: randomUUID(), expires_at: new Date(Date.now() + 86400000).toISOString() };
  const token = runtime.tokenFor(session, config);
  assert.equal(runtime.verifyToken(token, config), session.id);
  assert.equal(runtime.verifyToken(`${token}x`, config), null);
  assert.equal(runtime.verifyToken(token, config, Date.now() + 2 * 86400000), null);
  const body = JSON.stringify({ issuedAt: Date.now() });
  assert.equal(runtime.verifyWorker(body, runtime.workerSignature(body, config), config), true);
  assert.equal(runtime.verifyWorker(`${body} `, runtime.workerSignature(body, config), config), false);
  assert.equal(runtime.allowedRecipient('+15025550199', config), false);
  assert.equal(runtime.allowedRecipient(phone, config), true);
  assert.equal(store.messageUnits('a'.repeat(160)), 1);
  assert.equal(store.messageUnits('a'.repeat(161)), 2);
  assert.equal(store.messageUnits('^'.repeat(81)), 2);
  assert.equal(store.messageUnits('🙂'.repeat(36)), 2);
  assert.equal(store.messageUnits('a'.repeat(1000), 'https://image.invalid/preview.jpg'), 1);
});

test('size parsing requires explicit units and server limits; every finishing option is priced canonically', () => {
  assert.deepEqual(conversation.sizeOf('4 x 2 ft'), { width_in: 48, height_in: 24 });
  assert.deepEqual(conversation.sizeOf('60in by 3ft'), { width_in: 60, height_in: 36 });
  assert.equal(conversation.sizeOf('4 x 2'), null);
  assert.equal(conversation.sizeOf('1000 x 1000 in'), null);
  const session = { id: randomUUID(), config: { width_in: 72, height_in: 36, material: '13oz', quantity: 1, grommets: '4-corners', pole_pockets: 'none' } };
  const plain = conversation.quoteFor(session);
  const extras = conversation.quoteFor({ ...session, config: { ...session.config, rope_placement: 'top-bottom', pole_pockets: 'top', pole_pocket_position: 'top', pole_pocket_size: '2' } });
  assert.ok(extras.total_cents > plain.total_cents);
  assert.equal(extras.tax_cents, Math.round(extras.subtotal_after_discount_cents * 0.06));
});

test('durable conversations deduplicate retries, serialize a phone, and atomically save state and reply', async () => {
  const { db, sql } = await database();
  try {
    const first = await message(sql, 'I need a banner');
    assert.equal(first.session.step, 'SIZE');
    await store.receive(sql, { sid: first.sid, phone, payload: { Body: '1' } });
    assert.equal(await store.claimInbound(sql), null);
    const duplicate = await sql`SELECT COUNT(*)::integer AS count FROM bof_sms_outbox`;
    assert.equal(duplicate[0].count, 1);
    const ids = ['SM' + '1'.repeat(32), 'SM' + '2'.repeat(32)];
    for (const sid of ids) await store.receive(sql, { sid, phone, payload: { Body: '1' } });
    const claimed = await store.claimInbound(sql);
    assert.equal(claimed.sid, ids[0]);
    assert.equal(await store.claimInbound(sql), null);
    await worker.processInbound(sql, claimed, config);
    // A lost response cannot reset an already-committed inbound message.
    await store.retryInbound(sql, claimed, 'SIMULATED_RESPONSE_LOSS');
    assert.equal((await store.claimInbound(sql)).sid, ids[1]);
    assert.equal((await store.activeSession(sql, phone)).step, 'MATERIAL');
  } finally { await db.close(); }
});

test('image preview comes from the permanent print file, verifies existing placement format, and rejects poor source quality', async () => {
  const buffer = await sharp({ create: { width: 1000, height: 600, channels: 3, background: '#e00000' } }).png().toBuffer();
  const saved = new Map();
  async function upload(data, publicId, format) {
    saved.set(publicId, data);
    const meta = await sharp(data).metadata();
    return { public_id: publicId, secure_url: `https://res.cloudinary.com/test/image/upload/${publicId}.${format}`, width: meta.width, height: meta.height, version: 1, asset_id: publicId };
  }
  const session = { id: randomUUID(), revision: 0, config: { width_in: 6, height_in: 6, fit_mode: 'fit' } };
  const result = await artwork.renderArtwork(session, buffer, null, upload);
  assertReadyPlacementPreview(result.placement);
  assert.equal(result.widthPx, 600); assert.equal(result.heightPx, 600); assert.equal(result.dpi, 100);
  const print = await sharp(saved.get(result.printPublicId)).raw().toBuffer({ resolveWithObject: true });
  assert.ok(print.data[0] > 245 && print.data[1] > 245, 'FIT keeps white margins');
  const preview = await sharp(saved.get(result.placement.previewPublicId)).raw().toBuffer({ resolveWithObject: true });
  assert.equal(preview.info.width, print.info.width);
  assert.ok(preview.data[0] > 245 && preview.data[1] > 245);
  const low = await sharp({ create: { width: 200, height: 100, channels: 3, background: 'red' } }).png().toBuffer();
  await assert.rejects(artwork.inspectImage(low, session.config), { code: 'SMS_ARTWORK_LOW_RESOLUTION' });
});

test('MMS preview, approval, changed fit, STOP/START and restart use persisted revisions and suppress sends', async () => {
  const { db, sql } = await database();
  try {
    await configured(sql);
    const dependencies = { downloadTwilioMedia: async () => Buffer.from('fixture'),
      renderArtwork: async session => ({ originalUrl: 'https://res.cloudinary.com/test/image/upload/source.jpg', originalPublicId: 'source',
        previewUrl: `https://res.cloudinary.com/test/image/upload/r${session.revision + 1}.jpg`, printUrl: 'https://res.cloudinary.com/test/image/upload/print.jpg', printPublicId: 'print', widthPx: 600, heightPx: 600, dpi: 100, manifest: {}, placement: {} }),
      downloadStoredImage: async () => Buffer.from('fixture') };
    let result = await message(sql, '', { NumMedia: '1', MediaUrl0: 'fixture' }, dependencies);
    assert.equal(result.session.step, 'PREVIEW'); assert.equal(result.session.revision, 1);
    result = await message(sql, 'FIT', {}, dependencies);
    assert.equal(result.session.config.fit_mode, 'fit'); assert.equal(result.session.revision, 2);
    result = await message(sql, 'APPROVE');
    assert.equal(result.session.step, 'APPROVED'); assert.equal(result.session.approved_revision, 2);
    result = await message(sql, 'FILL', {}, dependencies);
    assert.equal(result.session.revision, 2, 'approved artwork cannot change');
    await message(sql, 'STOP'); assert.equal(await store.optedOut(sql, phone), true);
    assert.equal(await store.claimReply(sql, config), null, 'all pending replies suppressed');
    await message(sql, 'START'); assert.equal(await store.optedOut(sql, phone), false);
    const before = result.session.id;
    result = await message(sql, 'RESTART');
    assert.notEqual(result.session.id, before); assert.equal(result.session.step, 'SIZE');
    assert.equal((await store.getSession(sql, before)).step, 'CANCELED');
  } finally { await db.close(); }
});

test('outgoing budget reservations survive retries and uncertain sends are not duplicated', async () => {
  const { db, sql } = await database();
  try {
    await store.receive(sql, { sid: 'seed', phone, payload: {} });
    for (const key of ['one', 'two', 'three']) await store.queueReply(sql, { key, phone, body: 'a'.repeat(161) });
    const limited = { ...config, dailyMessages: 3, monthlyMessages: 3 };
    let calls = 0;
    const provider = { messages: { create: async () => { calls += 1; throw new Error('Network timeout after acceptance'); } } };
    await worker.sendReplies(sql, limited, provider);
    await worker.sendReplies(sql, limited, provider);
    assert.equal(calls, 1);
    const budget = (await sql`SELECT * FROM bof_sms_budget`)[0];
    assert.equal(budget.daily_units, 2);
    const rows = await sql`SELECT status FROM bof_sms_outbox ORDER BY status`;
    assert.deepEqual(rows.map(row => row.status), ['pending', 'pending', 'unknown']);
  } finally { await db.close(); }
});

test('hosted checkout retries have stable parameters and bind the exact approved revision, currency, amount and mode', () => {
  const session = { id: randomUUID(), order_id: randomUUID(), revision: 3, approved_revision: 3, checkout_key: 'sms_secure_checkout_key', stripe_session_id: 'cs_test_example', expires_at: new Date(Date.now() + 86400000), artwork: { previewUrl: 'https://res.cloudinary.com/test/image/upload/preview.jpg' } };
  const intent = { metadata: { bof_sms: 'v1', sms_session_id: session.id, internal_order_id: session.order_id, approved_revision: '3', checkout_key_hash: checkout.checkoutKeyHash(session.checkout_key) }, currency: 'usd', amount: 10600, livemode: false };
  const hosted = { id: session.stripe_session_id, metadata: { ...intent.metadata }, currency: 'usd', amount_total: 10600, livemode: false };
  assert.equal(payments.matchesProviderSession(session, hosted, intent, { mode: 'test' }), true);
  assert.equal(payments.matchesProviderSession({ ...session, revision: 4 }, hosted, intent, { mode: 'test' }), false);
  assert.equal(payments.matchesProviderSession(session, hosted, { ...intent, amount: 1 }, { mode: 'test' }), false);
  assert.equal(payments.matchesProviderSession(session, hosted, intent, { mode: 'live' }), false);
  const args = { session, config, order: { id: session.order_id, subtotal_cents: 10000, applied_discount_cents: 0, tax_cents: 600, total_cents: 10600 },
    item: { quantity: 1, width_in: 72, height_in: 36, material: '13oz' }, taxRate: 'txr_example',
    customer: { email: 'customer@example.com', shipping: { name: 'Customer', line1: '100 Main', city: 'Louisville', state: 'KY', postalCode: '40202' } } };
  assert.deepEqual(payments.hostedParameters(args), payments.hostedParameters(args));
  assert.equal(payments.hostedParameters(args).line_items[0].price_data.unit_amount, 10000);
  assert.equal(payments.hostedParameters(args).payment_method_types, undefined);
});

test('test/live mismatch and queued edits prevent checkout before a charge is attempted', async () => {
  const { db, sql } = await database();
  try {
    const session = await configured(sql);
    await sql`UPDATE bof_sms_sessions SET step = 'APPROVED', revision = 1, approved_revision = 1, artwork = '{}'::jsonb WHERE id = ${session.id}`;
    const approved = await store.getSession(sql, session.id);
    await assert.rejects(payments.createCheckout({ sql, session: approved, input: {}, config, stripe: {}, runtime: { mode: 'live' } }), { code: 'SMS_PAYMENT_MODE_MISMATCH' });
    await store.receive(sql, { sid: 'queued-edit', phone, payload: { Body: 'RESTART' } });
    await assert.rejects(payments.createCheckout({ sql, session: approved, input: {}, config, stripe: {}, runtime: { mode: 'test' } }), { code: 'SMS_CHECKOUT_IN_PROGRESS' });
  } finally { await db.close(); }
});

test('only a paid canonical Stripe session finalizes the saved order; webhook replay creates one confirmation', async () => {
  const { db, sql } = await database();
  const originalLoad = checkout.loadStripeOrder;
  try {
    const session = await store.createSession(sql, phone);
    const orderId = randomUUID();
    await sql`CREATE TABLE orders (id UUID PRIMARY KEY, order_number TEXT, stripe_payment_intent_id TEXT, payment_method TEXT,
      paypal_order_id TEXT, paypal_capture_id TEXT, payment_reconciliation_status TEXT, updated_at TIMESTAMPTZ, status TEXT)`;
    await sql`INSERT INTO orders(id, order_number, payment_method, status) VALUES (${orderId}, '123', 'stripe', 'pending')`;
    await sql`UPDATE bof_sms_sessions SET step = 'PAYMENT', revision = 1, approved_revision = 1, order_id = ${orderId}, stripe_session_id = 'cs_test_paid' WHERE id = ${session.id}`;
    const metadata = { bof_sms: 'v1', sms_session_id: session.id, internal_order_id: orderId, approved_revision: '1', checkout_key_hash: checkout.checkoutKeyHash(session.checkout_key) };
    const intent = { id: 'pi_test_paid', metadata, livemode: false, currency: 'usd', amount: 10600, status: 'succeeded', latest_charge: {} };
    const hosted = { id: 'cs_test_paid', metadata, livemode: false, currency: 'usd', amount_total: 10600, payment_status: 'unpaid', payment_intent: intent };
    let finalized = 0;
    checkout.loadStripeOrder = async () => ({ id: orderId, total_cents: 10600 });
    const args = { sql, config, runtime: { mode: 'test' }, stripe: { checkout: { sessions: { retrieve: async () => hosted } } },
      stripeEvent: { id: 'evt_test', type: 'checkout.session.completed', data: { object: { metadata } } },
      finalize: async () => { finalized++; return { ok: true, settled: true }; }, queueFollowups: async () => true };
    await payments.handleStripeEvent(args); assert.equal(finalized, 0);
    hosted.payment_status = 'paid';
    await payments.handleStripeEvent(args); await payments.handleStripeEvent(args);
    assert.equal((await store.getSession(sql, session.id)).step, 'PAID');
    assert.equal((await sql`SELECT COUNT(*)::integer AS count FROM bof_sms_outbox`)[0].count, 1);
    assert.match((await sql`SELECT body FROM bof_sms_outbox`)[0].body, /BOF-000123/);
    hosted.amount_total = 1;
    await assert.rejects(payments.handleStripeEvent(args), { code: 'SMS_PAYMENT_BINDING_INVALID' });
  } finally { checkout.loadStripeOrder = originalLoad; await db.close(); }
});

test('lost Checkout binding responses reuse one provider session; definitive async failure cancels the old intent before retry', async () => {
  const { db, sql } = await database();
  const originals = { create: checkout.createPendingOrderDirect, load: checkout.loadStripeOrder };
  try {
    const session = await configured(sql);
    const image = { originalUrl: 'https://res.cloudinary.com/test/image/upload/original.jpg', previewUrl: 'https://res.cloudinary.com/test/image/upload/preview.jpg',
      printUrl: 'https://res.cloudinary.com/test/image/upload/print.jpg', printPublicId: 'print', originalPublicId: 'original', widthPx: 600, heightPx: 600, dpi: 100 };
    const approved = await store.saveSession(sql, session, { step: 'APPROVED', revision: 1, approved_revision: 1, artwork: image });
    const quote = conversation.quoteFor(approved);
    const input = { customer: { fullName: 'Test Customer', email: 'customer@example.com' },
      shippingAddress: { name: 'Test Customer', line1: '100 Main', city: 'Louisville', state: 'KY', postalCode: '40202', country: 'US' } };
    const order = { id: randomUUID(), status: 'pending', subtotal_cents: quote.adjusted_subtotal_cents,
      applied_discount_cents: quote.applied_discount_cents, tax_cents: quote.tax_cents, total_cents: quote.total_cents,
      email: input.customer.email, customer_name: input.customer.fullName, customer_phone: phone,
      shipping_name: input.customer.fullName, shipping_street: '100 Main', shipping_city: 'Louisville', shipping_state: 'KY', shipping_zip: '40202', shipping_country: 'US' };
    checkout.createPendingOrderDirect = async () => ({ orderId: order.id });
    checkout.loadStripeOrder = async () => order;
    const providerSessions = new Map(); let canceled = false; let creates = 0;
    const stripe = { taxRates: { list: async () => ({ data: [{ id: 'txr_test', metadata: { bof_sms: 'v1' }, percentage: 6, inclusive: false }] }) },
      paymentIntents: { cancel: async () => { canceled = true; return { status: 'canceled' }; } },
      checkout: { sessions: {
        create: async (params, options) => {
          const previous = providerSessions.get(options.idempotencyKey);
          if (previous) { assert.deepEqual(params, previous.parameters); return previous; }
          creates++; if (creates === 2) assert.equal(canceled, true);
          const result = { id: `cs_test_${creates}`, url: `https://checkout.stripe.com/c/pay/test_${creates}`, amount_total: quote.total_cents, livemode: false, status: 'open', parameters: params };
          providerSessions.set(options.idempotencyKey, result); return result;
        }, retrieve: async () => ({ status: 'complete', payment_status: 'unpaid', payment_intent: { id: 'pi_failed', status: 'requires_payment_method' } }),
      } } };
    let lost = false;
    const flakySql = async (strings, ...values) => {
      if (!lost && strings.join(' ').includes('SET stripe_session_id =') && !strings.join(' ').includes('checkout_attempt')) {
        lost = true; throw new Error('Lost database connection before binding');
      }
      return sql(strings, ...values);
    };
    const args = { input, config, stripe, runtime: { mode: 'test' } };
    await assert.rejects(payments.createCheckout({ ...args, sql: flakySql, session: approved }), /Lost database/);
    await payments.createCheckout({ ...args, sql, session: await store.getSession(sql, session.id) });
    assert.equal(creates, 1);
    assert.equal((await store.getSession(sql, session.id)).stripe_session_id, 'cs_test_1');
    await payments.createCheckout({ ...args, sql, session: await store.getSession(sql, session.id) });
    assert.equal(creates, 2); assert.equal(canceled, true);
    assert.equal((await store.getSession(sql, session.id)).stripe_session_id, 'cs_test_2');
  } finally { checkout.createPendingOrderDirect = originals.create; checkout.loadStripeOrder = originals.load; await db.close(); }
});
