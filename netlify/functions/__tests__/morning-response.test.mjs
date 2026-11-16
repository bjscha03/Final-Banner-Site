import { describe, expect, it, vi } from 'vitest';
import { withLambda } from '@netlify/aws-lambda-compat';
import morning from '../_shared/outbound-sales/morning-handler.cjs';

describe('scheduled worker response through the production adapter', () => {
  it.each(['launch', 'replenish', 'finalize'])('returns an empty 204 for %s without a platform retry', async action => {
    const dispatchBackground = vi.fn();
    const handler = withLambda(morning.createMorningScheduledHandler({ action,
      env: { DATABASE_URL: 'postgres://response-test.invalid/database' },
      dependencies: { createSql: () => vi.fn(), ensureMorningBatch: async () => null, dispatchBackground } }));
    const response = await handler(new Request('https://site.example/scheduled'), { requestId: 'test' });
    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
    expect(await response.text()).toBe('');
    expect(dispatchBackground).not.toHaveBeenCalled();
  });
});
