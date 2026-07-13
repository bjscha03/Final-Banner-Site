/**
 * Server-verified admin/test-checkout status endpoint.
 *
 * Production admin access still requires a valid signed admin session. In a
 * verified Netlify Deploy Preview, this endpoint automatically issues a
 * short-lived signed preview-test session so the preview can never fall into
 * the live PayPal checkout path merely because a legacy/local admin identity
 * is missing.
 */

const { neon } = require('@neondatabase/serverless');
const {
  createAdminSession,
  verifyAdminSession,
  isDeployPreviewEnvironment,
  PREVIEW_MAX_AGE_SECONDS,
} = require('./_shared/admin-session.cjs');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Credentials': 'true',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

function getDatabaseEnvironmentLabel() {
  if (isDeployPreviewEnvironment()) return 'preview';
  const context = String(process.env.CONTEXT || process.env.VERCEL_ENV || process.env.NETLIFY_CONTEXT || '').toLowerCase();
  if (context === 'production') return 'production';
  if (context === 'dev' || context === 'development') return 'development';
  return context || 'unknown';
}

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...headers, ...extraHeaders },
    body: JSON.stringify(body),
  };
}

function createDiagnostics(session) {
  return {
    adminSessionPresent: session.present,
    adminSessionValid: session.valid,
    adminSessionExpired: session.expired,
    adminSessionConfigured: session.configured,
    adminSessionReason: session.reason || null,
    profileRowFound: false,
    profileIsAdminValue: null,
    databaseReachable: false,
    databaseEnvironment: getDatabaseEnvironmentLabel(),
    adminSource: 'none',
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let session = verifyAdminSession(event);
  let diagnostics = createDiagnostics(session);
  const deployPreview = isDeployPreviewEnvironment();
  const previewTestCheckoutEnabled = process.env.DISABLE_DEPLOY_PREVIEW_TEST_CHECKOUT !== '1';

  // A Deploy Preview is a non-production QA environment. Automatically issue
  // a short-lived, HMAC-signed test session so checkout is test-only and never
  // loads/captures live PayPal merely because no browser/localStorage admin
  // identity exists. create-order independently verifies both this signature
  // and the Deploy Preview environment before accepting the bypass.
  if (deployPreview && previewTestCheckoutEnabled && !session.valid) {
    try {
      const previewSession = createAdminSession({
        profileId: null,
        email: null,
        maxAgeSeconds: PREVIEW_MAX_AGE_SECONDS,
        source: 'deploy_preview_auto_session',
      });

      session = {
        present: true,
        valid: true,
        expired: false,
        configured: true,
        claims: previewSession.claims,
        reason: null,
      };
      diagnostics = createDiagnostics(session);
      diagnostics.adminSource = 'deploy_preview_auto_session';

      console.log('[check-admin-status] issued Deploy Preview test session', {
        deployPreview: true,
        sessionValid: true,
        databaseEnvironment: diagnostics.databaseEnvironment,
      });

      return json(200, {
        authenticated: true,
        isAdmin: true,
        source: diagnostics.adminSource,
        message: 'Deploy Preview test checkout is active. No live payment will be processed.',
        diagnostics,
      }, {
        'Set-Cookie': previewSession.cookie,
      });
    } catch (error) {
      console.error('[check-admin-status] unable to issue Deploy Preview test session:', error.message);
      diagnostics.adminSessionConfigured = false;
      diagnostics.adminSessionReason = error.code || 'PREVIEW_SESSION_CREATE_FAILED';
      return json(500, {
        authenticated: false,
        isAdmin: false,
        source: 'none',
        error: error.code || 'PREVIEW_SESSION_CREATE_FAILED',
        message: 'Deploy Preview test checkout could not be initialized.',
        diagnostics,
      });
    }
  }

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
  diagnostics.adminSource = isAdmin
    ? (session.claims?.source || 'signed_admin_session')
    : 'none';

  console.log('[check-admin-status] resolved signed admin session', {
    deployPreview,
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