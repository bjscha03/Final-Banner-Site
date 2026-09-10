import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import serverAuth from '../_shared/server-auth.cjs';
import { handler, _test } from '../admin-send-september-promo.mjs';

const originalEnv = { ...process.env };

function event(requestId = 'request_key_1234567890') {
  const token = serverAuth.createSessionToken({
    id: 'admin-1',
    email: 'admin@bannersonthefly.com',
    is_admin: true,
  });
  return {
    httpMethod: 'POST',
    rawUrl: 'https://bannersonthefly.com/.netlify/functions/admin-send-september-promo',
    headers: {
      host: 'bannersonthefly.com',
      origin: 'https://bannersonthefly.com',
      'x-forwarded-proto': 'https',
      'x-banners-admin-session': token,
      'x-idempotency-key': requestId,
    },
    body: JSON.stringify({ email: 'buyer@customer.com', customerName: 'Buyer Name' }),
  };
}

function createSqlState() {
  const state = {
    status: null,
    sentAt: null,
    messageId: null,
    queries: [],
  };
  const sql = async (strings, ...values) => {
    const query = Array.isArray(strings) ? strings.join(' ? ') : String(strings);
    state.queries.push(query);
    if (query.includes('FROM orders o')) return [{ customer_name: 'Buyer Name' }];
    if (query.includes('INSERT INTO marketing_email_sends')) {
      if (state.status === null || state.status === 'error') {
        state.status = 'processing';
        return [{ id: 'send-1', status: 'processing', attempt_count: 1 }];
      }
      return [];
    }
    if (query.includes('SELECT id, status, sent_at')) {
      return [{ id: 'send-1', status: state.status, sent_at: state.sentAt, resend_message_id: state.messageId }];
    }
    if (query.includes("SET status = 'sent'")) {
      state.status = 'sent';
      state.sentAt = '2026-09-02T01:23:45.000Z';
      state.messageId = values.find((value) => value === 'resend-message-1') || 'resend-message-1';
      return [{ sent_at: state.sentAt }];
    }
    if (query.includes("SET status = 'error'")) {
      state.status = 'error';
      return [];
    }
    return [];
  };
  return { sql, state };
}

describe('admin September promotion send endpoint', () => {
  beforeEach(() => {
    process.env.AUTH_SESSION_SECRET = 'admin-session-secret-for-tests';
    process.env.MARKETING_EMAIL_TOKEN_SECRET = 'marketing-token-secret-for-tests';
    process.env.RESEND_API_KEY = 'resend-test-key';
    process.env.DATABASE_URL = 'postgres://test.invalid/db';
    process.env.URL = 'https://bannersonthefly.com';
    _test.setEnsureSchema(async () => {});
    _test.setFindEmailSuppression(async () => ({ suppressed: false, reason: null, source: null }));
    _test.setNowFactory(() => new Date('2026-09-02T12:00:00.000Z'));
  });

  afterEach(() => {
    _test.resetDependencies();
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('sends to the selected customer once and returns the persisted sent timestamp on duplicate clicks', async () => {
    const { sql, state } = createSqlState();
    const sends = [];
    _test.setNeonFactory(() => sql);
    _test.setResendFactory(() => ({
      emails: {
        send: vi.fn(async (payload, options) => {
          sends.push({ payload, options });
          return { data: { id: 'resend-message-1' }, error: null };
        }),
      },
    }));

    const first = await handler(event('request_key_1234567890'));
    const firstBody = JSON.parse(first.body);
    expect(first.statusCode).toBe(200);
    expect(firstBody.status).toBe('sent');
    expect(firstBody.sentAt).toBe('2026-09-02T01:23:45.000Z');
    expect(state.status).toBe('sent');
    expect(sends).toHaveLength(1);
    expect(sends[0].payload.to).toBe('buyer@customer.com');
    expect(sends[0].payload.subject).toBe('25% Off Large Banners — This Week Only');
    expect(sends[0].payload.html).toContain('BIG25');
    expect(sends[0].options.idempotencyKey).toMatch(/^bof-september-promo\/[a-f0-9]{40}$/);

    const duplicate = await handler(event('request_key_0987654321'));
    const duplicateBody = JSON.parse(duplicate.body);
    expect(duplicate.statusCode).toBe(200);
    expect(duplicateBody.duplicate).toBe(true);
    expect(duplicateBody.status).toBe('sent');
    expect(sends).toHaveLength(1);
  });

  it('blocks a rapid concurrent duplicate while the first send is still processing', async () => {
    const { sql } = createSqlState();
    let releaseProvider;
    const providerResult = new Promise((resolve) => { releaseProvider = resolve; });
    let providerCalls = 0;
    _test.setNeonFactory(() => sql);
    _test.setResendFactory(() => ({
      emails: {
        send: vi.fn(async () => {
          providerCalls += 1;
          return providerResult;
        }),
      },
    }));

    const firstPromise = handler(event('request_key_concurrent_1'));
    for (let index = 0; index < 10 && providerCalls === 0; index += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    expect(providerCalls).toBe(1);
    const duplicate = await handler(event('request_key_concurrent_2'));
    expect(duplicate.statusCode).toBe(409);
    expect(JSON.parse(duplicate.body)).toMatchObject({ duplicate: true, status: 'processing' });
    expect(providerCalls).toBe(1);

    releaseProvider({ data: { id: 'resend-message-1' }, error: null });
    const first = await firstPromise;
    expect(first.statusCode).toBe(200);
  });
});
