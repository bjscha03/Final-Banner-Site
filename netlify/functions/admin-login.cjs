const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');
const { createAdminSession } = require('./_shared/admin-session.cjs');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const json = (statusCode, body, extraHeaders = {}) => ({ statusCode, headers: { ...headers, ...extraHeaders }, body: JSON.stringify(body) });

function timingSafeStringEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'hex');
  const right = Buffer.from(String(b || ''), 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifyPasswordHash(password, storedHash) {
  if (!password || !storedHash) return false;
  const parts = String(storedHash).split(':');
  try {
    if (parts[0] === 'pbkdf2' && parts.length === 4) {
      const [, salt, iterationsRaw, expected] = parts;
      const iterations = Number.parseInt(iterationsRaw, 10);
      const actual = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
      return timingSafeStringEqual(actual, expected);
    }
    if (parts[0] === 'sha256' && parts.length === 3) {
      const [, salt, expected] = parts;
      const actual = crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex');
      return timingSafeStringEqual(actual, expected);
    }
  } catch (_err) {
    return false;
  }
  return false;
}

function allowlistIncludes(email) {
  if (!email) return false;
  return String(process.env.ADMIN_TEST_PAY_ALLOWLIST || '')
    .split(',')
    .map(normalizeEmail)
    .filter(Boolean)
    .includes(normalizeEmail(email));
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' });

  if (!process.env.ADMIN_SESSION_SECRET || !process.env.ADMIN_PANEL_PASSWORD_HASH) {
    return json(500, {
      ok: false,
      error: 'ADMIN_SESSION_NOT_CONFIGURED',
      message: 'Server-side admin authentication is not configured for this deployment.',
    });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (_err) {
    return json(400, { ok: false, error: 'INVALID_JSON', message: 'Invalid request body.' });
  }

  const password = String(body.password || '');
  const email = normalizeEmail(body.email);
  if (!verifyPasswordHash(password, process.env.ADMIN_PANEL_PASSWORD_HASH)) {
    return json(401, { ok: false, error: 'INVALID_ADMIN_CREDENTIALS', message: 'Invalid admin credentials.' });
  }

  let profile = null;
  let databaseReachable = false;
  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (dbUrl && email) {
    try {
      const db = neon(dbUrl);
      const rows = await db`
        SELECT id, email, is_admin
        FROM profiles
        WHERE lower(trim(email)) = ${email}
        LIMIT 1
      `;
      databaseReachable = true;
      profile = rows && rows[0] ? rows[0] : null;
      if (profile && profile.is_admin !== true && allowlistIncludes(email)) {
        await db`UPDATE profiles SET is_admin = true, updated_at = NOW() WHERE id = ${profile.id}`;
        profile.is_admin = true;
      }
    } catch (dbError) {
      console.warn('[admin-login] profile lookup failed:', dbError.message);
    }
  }

  const profileIsAdmin = profile?.is_admin === true;
  const allowlistAdmin = allowlistIncludes(email);
  if (email && !profileIsAdmin && !allowlistAdmin) {
    return json(403, {
      ok: false,
      error: 'ADMIN_PROFILE_NOT_AUTHORIZED',
      message: 'This account is not authorized for admin access.',
      diagnostics: { databaseReachable, profileRowFound: !!profile },
    });
  }

  try {
    const session = createAdminSession({
      profileId: profile?.id || null,
      email: profile?.email || email || null,
    });
    return json(200, {
      ok: true,
      isAdmin: true,
      source: profileIsAdmin ? 'profile' : allowlistAdmin ? 'allowlist' : 'server_password',
      diagnostics: { databaseReachable, profileRowFound: !!profile, profileIsAdminValue: profile ? profile.is_admin === true : null },
    }, { 'Set-Cookie': session.cookie });
  } catch (err) {
    if (err.code === 'ADMIN_SESSION_NOT_CONFIGURED') {
      return json(500, { ok: false, error: 'ADMIN_SESSION_NOT_CONFIGURED', message: 'Server-side admin authentication is not configured for this deployment.' });
    }
    throw err;
  }
};
