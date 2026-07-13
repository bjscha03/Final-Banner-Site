/**
 * Admin Status Check Endpoint
 *
 * Resolves admin status from the authenticated profile identity first, then
 * falls back to the trusted ADMIN_TEST_PAY_ALLOWLIST environment variable.
 * Returns only safe booleans/labels for Deploy Preview diagnostics.
 */

const { neon } = require('@neondatabase/serverless');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeId = (value) => String(value || '').trim();

function getAllowlist() {
  return String(process.env.ADMIN_TEST_PAY_ALLOWLIST || '')
    .split(',')
    .map(normalizeEmail)
    .filter(Boolean);
}

function getDatabaseEnvironmentLabel() {
  const context = String(process.env.CONTEXT || process.env.VERCEL_ENV || '').toLowerCase();
  if (context === 'deploy-preview' || context === 'preview') return 'preview';
  if (context === 'production') return 'production';
  if (context === 'dev' || context === 'development') return 'development';
  return context || 'unknown';
}

function json(statusCode, body) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  try {
    let requestBody;
    try {
      requestBody = JSON.parse(event.body || '{}');
    } catch (_parseError) {
      return json(400, { error: 'Invalid JSON' });
    }

    const authenticatedUserId = normalizeId(requestBody.userId || requestBody.user_id || requestBody.id);
    const authenticatedEmail = normalizeEmail(requestBody.email);

    if (!authenticatedEmail && !authenticatedUserId) {
      return json(400, {
        error: 'Authenticated user identity is required',
        authenticated: false,
        isAdmin: false,
        source: 'none',
      });
    }

    const allowlist = getAllowlist();
    const allowlistMatch = !!authenticatedEmail && allowlist.includes(authenticatedEmail);
    const diagnostics = {
      profileRowFound: false,
      profileIdMatchesAuthenticatedUser: false,
      profileEmailMatchesAuthenticatedEmail: false,
      profileIsAdminValue: null,
      adminAllowlistMatch: allowlistMatch,
      adminSource: 'none',
      databaseReachable: false,
      databaseEnvironment: getDatabaseEnvironmentLabel(),
    };

    let profile = null;
    let db = null;
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (dbUrl) {
      try {
        db = neon(dbUrl);
        let rows = [];
        if (authenticatedUserId) {
          rows = await db`
            SELECT id, email, is_admin
            FROM profiles
            WHERE id = ${authenticatedUserId}
            LIMIT 1
          `;
        }

        if ((!rows || rows.length === 0) && authenticatedEmail) {
          rows = await db`
            SELECT id, email, is_admin
            FROM profiles
            WHERE lower(trim(email)) = ${authenticatedEmail}
            LIMIT 1
          `;
        }

        profile = rows && rows[0] ? rows[0] : null;
        diagnostics.databaseReachable = true;
        diagnostics.profileRowFound = !!profile;
      } catch (dbError) {
        console.warn('[check-admin-status] profile lookup failed:', dbError.message);
      }
    } else {
      console.warn('[check-admin-status] database URL not configured; using allowlist only');
    }

    if (profile) {
      diagnostics.profileIdMatchesAuthenticatedUser = authenticatedUserId ? String(profile.id) === authenticatedUserId : false;
      diagnostics.profileEmailMatchesAuthenticatedEmail = authenticatedEmail ? normalizeEmail(profile.email) === authenticatedEmail : false;
      diagnostics.profileIsAdminValue = profile.is_admin === true ? true : profile.is_admin === false ? false : null;
    }

    if (db && profile && allowlistMatch && diagnostics.profileIsAdminValue !== true) {
      try {
        await db`
          UPDATE profiles
          SET is_admin = true, updated_at = NOW()
          WHERE id = ${profile.id}
        `;
        diagnostics.profileIsAdminValue = true;
        console.log('[check-admin-status] promoted allowlisted profile to is_admin=true', {
          profileRowFound: true,
          profileIdMatchesAuthenticatedUser: diagnostics.profileIdMatchesAuthenticatedUser,
          profileEmailMatchesAuthenticatedEmail: diagnostics.profileEmailMatchesAuthenticatedEmail,
        });
      } catch (promoteError) {
        console.warn('[check-admin-status] failed to persist allowlisted admin flag:', promoteError.message);
      }
    }

    const profileAdmin = diagnostics.profileRowFound && diagnostics.profileIsAdminValue === true;
    const isAdmin = profileAdmin || allowlistMatch;
    diagnostics.adminSource = profileAdmin ? 'profile' : allowlistMatch ? 'allowlist' : 'none';

    console.log('[check-admin-status] resolved admin status', {
      hasUserId: !!authenticatedUserId,
      hasEmail: !!authenticatedEmail,
      profileRowFound: diagnostics.profileRowFound,
      profileIdMatchesAuthenticatedUser: diagnostics.profileIdMatchesAuthenticatedUser,
      profileEmailMatchesAuthenticatedEmail: diagnostics.profileEmailMatchesAuthenticatedEmail,
      profileIsAdminValue: diagnostics.profileIsAdminValue,
      adminAllowlistMatch: diagnostics.adminAllowlistMatch,
      adminSource: diagnostics.adminSource,
      isAdmin,
      databaseReachable: diagnostics.databaseReachable,
      databaseEnvironment: diagnostics.databaseEnvironment,
    });

    return json(200, {
      authenticated: diagnostics.profileRowFound || allowlistMatch,
      isAdmin,
      source: diagnostics.adminSource,
      diagnostics,
    });
  } catch (error) {
    console.error('Admin status check error:', error);
    return json(500, {
      error: 'Internal server error',
      authenticated: false,
      isAdmin: false,
      source: 'none',
      diagnostics: {
        profileRowFound: false,
        profileIdMatchesAuthenticatedUser: false,
        profileEmailMatchesAuthenticatedEmail: false,
        profileIsAdminValue: null,
        adminAllowlistMatch: false,
        adminSource: 'none',
        databaseReachable: false,
        databaseEnvironment: getDatabaseEnvironmentLabel(),
      },
    });
  }
};
