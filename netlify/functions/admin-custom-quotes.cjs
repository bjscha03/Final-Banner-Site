const { neon } = require('@neondatabase/serverless');
const VALID_STATUSES = ['New', 'Reviewing', 'Quoted', 'Approved', 'Declined', 'Closed'];
function headers(){return {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json'};}
function send(statusCode, body){return {statusCode, headers:headers(), body:JSON.stringify(body)};}
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers(), body: '' };
  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.VITE_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) return send(500, { ok:false, error:'Database not configured' });
  const sql = neon(dbUrl);
  try {
    if (event.httpMethod === 'GET') {
      const params = new URLSearchParams(event.rawQuery || '');
      const q = `%${(params.get('q') || '').trim()}%`;
      const status = params.get('status') || 'all';
      const rows = status === 'all'
        ? await sql`SELECT * FROM custom_quote_requests WHERE (${q} = '%%' OR quote_number ILIKE ${q} OR full_name ILIKE ${q} OR email ILIKE ${q} OR company_name ILIKE ${q}) ORDER BY created_at DESC LIMIT 200`
        : await sql`SELECT * FROM custom_quote_requests WHERE status = ${status} AND (${q} = '%%' OR quote_number ILIKE ${q} OR full_name ILIKE ${q} OR email ILIKE ${q} OR company_name ILIKE ${q}) ORDER BY created_at DESC LIMIT 200`;
      const counts = await sql`SELECT status, COUNT(*)::int AS count FROM custom_quote_requests GROUP BY status`;
      return send(200, { ok:true, quotes: rows, counts });
    }
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      if (!body.id) return send(400, { ok:false, error:'id is required' });
      if (body.status && !VALID_STATUSES.includes(body.status)) return send(400, { ok:false, error:'Invalid status' });
      const rows = await sql`UPDATE custom_quote_requests SET status = COALESCE(${body.status || null}, status), internal_notes = COALESCE(${body.internalNotes ?? null}, internal_notes), updated_at = NOW() WHERE id = ${body.id} RETURNING *`;
      return send(200, { ok:true, quote: rows[0] });
    }
    return send(405, { ok:false, error:'Method not allowed' });
  } catch (error) { console.error('admin custom quotes failed:', error); return send(500, { ok:false, error:'Failed to process request' }); }
};
