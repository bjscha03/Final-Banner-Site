import type { Context } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { RETENTION_MS, STORE_NAME, validIssueKey } from './_shared/site-issues';
export default async (_request: Request, context: Context) => {
  if (context.deploy.context !== 'production') return;
  const store = getStore({ name: STORE_NAME, consistency: 'strong' });
  const { blobs } = await store.list({ prefix: 'events/' });
  const stale = blobs.filter(b => validIssueKey(b.key) && Date.parse(b.key.split('/')[1]) < Date.now() - RETENTION_MS).slice(0, 1000);
  for (let i = 0; i < stale.length; i += 10) await Promise.all(stale.slice(i, i + 10).map(b => store.delete(b.key)));
};
export const config = { schedule: '17 8 * * *' };
