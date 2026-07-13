/**
 * Server-verified admin status endpoint.
 *
 * This endpoint does not trust browser-supplied userId/email/isAdmin values.
 * It reads and verifies the HttpOnly botf_admin_session cookie and returns
 * only safe diagnostic booleans for Deploy Preview troubleshooting.
 */

const { neon } = require('@neondatabase/serverless');
const { verifyAdminSession } = require('./_shared/admin-session.cjs');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function getDatabaseEnvironmentLabel() {
  const context = String(process.env.CONTEXT || process.env.VERCEL_ENV || '').toLowerCase();
  if (context === 'deploy-preview' || context === 'preview') return 'preview';
  if (context === 'production') return 'production';
  if (context === 'dev' || context === 'development') return 'development';
  return context || 'unknown';
}

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const session = verifyAdminSession(event);
  const diagnostics = {
    adminSessionPresent: session.present,
    adminSessionValid: session.valid,
    adminSessionExpired: session.expired,
    profileRowFound: false,
    profileIsAdminValue: null,
    databaseReachable: false,
    databaseEnvironment: getDatabaseEnvironmentLabel(),
    adminSource: 'none',
  };

  if (!session.configured) {
    return json(200, {
      authenticated: false,
      isAdmin: false,
      source: 'none',
      message: 'Server-side admin authentication is not configured for this deployment.',
      diagnostics,
    });
  }

  if (!session.valid) {
    return json(200, {
      authenticated: false,
      isAdmin: false,
      source: 'none',
      diagnostics,
    });
  }

  let profileIsStillAdmin = false;
  const profileId = session.claims?.profileId || null;
  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (dbUrl && profileId) {
    try {
      const db = neon(dbUrl);
      const rows = await db`
        SELECT id, is_admin
        FROM profiles
        WHERE id = ${profileId}
        LIMIT 1
      `;
      diagnostics.databaseReachable = true;
      const profile = rows && rows[0] ? rows[0] : null;
      diagnostics.profileRowFound = !!profile;
      diagnostics.profileIsAdminValue = profile ? profile.is_admin === true : null;
      profileIsStillAdmin = profile?.is_admin === true;
    } catch (dbError) {
      console.warn('[check-admin-status] profile lookup failed:', dbError.message);
    }
  } else if (dbUrl) {
    diagnostics.databaseReachable = true;
  }

  const isAdmin = session.valid && (!profileId || profileIsStillAdmin);
  diagnostics.adminSource = isAdmin ? 'signed_admin_session' : 'none';

  console.log('[check-admin-status] resolved signed admin session', {
    adminSessionPresent: diagnostics.adminSessionPresent,
    adminSessionValid: diagnostics.adminSessionValid,
    adminSessionExpired: diagnostics.adminSessionExpired,
    profileRowFound: diagnostics.profileRowFound,
    profileIsAdminValue: diagnostics.profileIsAdminValue,
    databaseReachable: diagnostics.databaseReachable,
    databaseEnvironment: diagnostics.databaseEnvironment,
    isAdmin,
  });

  return json(200, {
    authenticated: isAdmin,
    isAdmin,
    source: diagnostics.adminSource,
    diagnostics,
  });
};
