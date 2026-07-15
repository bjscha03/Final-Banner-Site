const { neon } = require('@neondatabase/serverless');
const { processDueConversions } = require('./_shared/googleAdsConversions.cjs');

const headers = { 'Content-Type': 'application/json' };

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED' }) };
  }

  const expectedSecret = process.env.CONVERSION_WORKER_SECRET;
  if (expectedSecret) {
    const supplied = event.headers['x-conversion-worker-secret'] || event.headers['X-Conversion-Worker-Secret'];
    if (supplied !== expectedSecret) {
      return { statusCode: 401, headers, body: JSON.stringify({ ok: false, error: 'UNAUTHORIZED' }) };
    }
  }

  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'DATABASE_NOT_CONFIGURED' }) };

  try {
    const sql = neon(dbUrl);
    const limit = Math.max(1, Math.min(50, Number(event.queryStringParameters?.limit || 10)));
    const result = await processDueConversions(sql, { limit });
    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch (error) {
    console.error('[process-google-ads-conversions] error', error);
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'WORKER_FAILED', message: error.message }) };
  }
};
