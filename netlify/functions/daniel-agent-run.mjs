import { runWorker } from '../../server/daniel-agent/worker.mjs';
export default async function handler(request) {
  const secret = process.env.DANIEL_CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== 'Bearer ' + secret) {
    return new Response('Unauthorized', {status: 401});
  }
  try { return Response.json(await runWorker()); }
  catch (error) { console.error('Daniel worker failed', error.message); return Response.json({error: 'Worker failed'}, {status: 500}); }
}
export const config = {path: '/api/internal/daniel-agent/run'};
