const { neon } = require('@neondatabase/serverless');
const { requireAdmin } = require('./_shared/server-auth.cjs');
const VALID_STATUSES = ['New', 'Reviewing', 'Quoted', 'Approved', 'Declined', 'Closed'];

function getDbUrl() {
  return process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
}

function getDbLabel() {
  const url = getDbUrl();
  const source = process.env.NETLIFY_DATABASE_URL ? 'NETLIFY_DATABASE_URL' : process.env.DATABASE_URL ? 'DATABASE_URL' : process.env.NEON_DATABASE_URL ? 'NEON_DATABASE_URL' : 'missing';
  let host = 'unknown';
  try { host = url ? new URL(url).hostname : 'missing'; } catch {}
  return { source, host };
}

function toApiQuote(row) {
  return {
    id: row.id,
    quoteNumber: row.quote_number,
    quote_number: row.quote_number,
    fullName: row.full_name,
    full_name: row.full_name,
    companyName: row.company_name,
    company_name: row.company_name,
    email: row.email,
    phone: row.phone,
    productType: row.product_type,
    product_type: row.product_type,
    width: row.width,
    height: row.height,
    unit: row.unit,
    quantity: row.quantity,
    materialSpecs: row.material_specs,
    material_specs: row.material_specs,
    finishingOptions: row.finishing_options,
    finishing_options: row.finishing_options,
    neededByDate: row.needed_by_date,
    needed_by_date: row.needed_by_date,
    shippingZip: row.shipping_zip,
    shipping_zip: row.shipping_zip,
    projectDescription: row.project_description,
    project_description: row.project_description,
    additionalNotes: row.additional_notes,
    additional_notes: row.additional_notes,
    productOptions: row.product_options || {},
    product_options: row.product_options || {},
    uploadedFiles: row.artwork_files || [],
    artwork_files: row.artwork_files || [],
    emailWarnings: row.email_warnings || [],
    email_warnings: row.email_warnings || [],
    internalNotes: row.internal_notes,
    internal_notes: row.internal_notes,
    status: row.status || 'New',
    createdAt: row.created_at,
    created_at: row.created_at,
  };
}
function headers(){return {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json'};}
function send(statusCode, body){return {statusCode, headers:headers(), body:JSON.stringify(body)};}

async function ensureDatabaseObjects(sql) {
  await sql`CREATE SEQUENCE IF NOT EXISTS custom_quote_request_number_seq START WITH 1`;
  await sql`CREATE TABLE IF NOT EXISTS custom_quote_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_number VARCHAR(20) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'New',
    full_name VARCHAR(160) NOT NULL,
    company_name VARCHAR(160),
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(40) NOT NULL,
    product_type VARCHAR(40) NOT NULL,
    width NUMERIC(10,2) NOT NULL,
    height NUMERIC(10,2) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    quantity INTEGER NOT NULL,
    material_specs TEXT,
    finishing_options TEXT,
    needed_by_date DATE,
    shipping_zip VARCHAR(20) NOT NULL,
    project_description TEXT NOT NULL,
    additional_notes TEXT,
    product_options JSONB NOT NULL DEFAULT '{}'::jsonb,
    artwork_files JSONB NOT NULL DEFAULT '[]'::jsonb,
    email_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
    internal_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`ALTER TABLE custom_quote_requests ADD COLUMN IF NOT EXISTS email_warnings JSONB NOT NULL DEFAULT '[]'::jsonb`;
}
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers(), body: '' };
  const auth = requireAdmin(event);
  if (!auth.ok) return { ...auth.response, headers: { ...headers(), ...auth.response.headers } };
  const dbUrl = getDbUrl();
  if (!dbUrl) return send(500, { ok:false, error:'Database not configured' });
  const sql = neon(dbUrl);
  const dbLabel = getDbLabel();
  console.log('[admin-custom-quotes] database target', dbLabel);
  try {
    await ensureDatabaseObjects(sql);
    if (event.httpMethod === 'GET') {
      const params = new URLSearchParams(event.rawQuery || '');
      const id = params.get('id');
      if (id) {
        const detailRows = await sql`SELECT * FROM custom_quote_requests WHERE id = ${id} OR quote_number = ${id} LIMIT 1`;
        return send(200, { ok:true, quote: detailRows[0] ? toApiQuote(detailRows[0]) : null, db: dbLabel });
      }
      const q = `%${(params.get('q') || '').trim()}%`;
      const status = params.get('status') || 'all';
      const rows = status === 'all'
        ? await sql`SELECT * FROM custom_quote_requests WHERE (${q} = '%%' OR quote_number ILIKE ${q} OR full_name ILIKE ${q} OR email ILIKE ${q} OR company_name ILIKE ${q}) ORDER BY created_at DESC LIMIT 200`
        : await sql`SELECT * FROM custom_quote_requests WHERE status = ${status} AND (${q} = '%%' OR quote_number ILIKE ${q} OR full_name ILIKE ${q} OR email ILIKE ${q} OR company_name ILIKE ${q}) ORDER BY created_at DESC LIMIT 200`;
      const counts = await sql`SELECT status, COUNT(*)::int AS count FROM custom_quote_requests GROUP BY status`;
      return send(200, { ok:true, quotes: rows.map(toApiQuote), counts, db: dbLabel });
    }
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      if (!body.id) return send(400, { ok:false, error:'id is required' });
      if (body.status && !VALID_STATUSES.includes(body.status)) return send(400, { ok:false, error:'Invalid status' });
      const rows = await sql`UPDATE custom_quote_requests SET status = COALESCE(${body.status || null}, status), internal_notes = COALESCE(${body.internalNotes ?? null}, internal_notes), updated_at = NOW() WHERE id = ${body.id} RETURNING *`;
      return send(200, { ok:true, quote: toApiQuote(rows[0]), db: dbLabel });
    }
    return send(405, { ok:false, error:'Method not allowed' });
  } catch (error) { console.error('[admin-custom-quotes] query failed', { message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }); return send(500, { ok:false, error:'Failed to process request' }); }
};
