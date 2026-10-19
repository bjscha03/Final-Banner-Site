import { withLambda } from '@netlify/aws-lambda-compat';
import auth from './_shared/server-auth.cjs';

const reply = (statusCode, error) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify({ error }) });
export async function handler(event) {
  const session = auth.requireAdmin(event);
  if (!session.ok) return session.response;
  if (event.httpMethod !== 'POST') return reply(405, 'Method not allowed');
  return reply(410, 'AI artwork is supplied as a full-size JPG. Use Download AI Artwork in the order.');
}
export default withLambda(handler);
