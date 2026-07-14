const PREVIEW_ADMIN_COOKIE = 'botf_preview_admin';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function isDeployPreviewEnvironment() {
  return process.env.CONTEXT === 'deploy-preview'
    || /^https:\/\/deploy-preview-\d+--.+\.netlify\.app$/i.test(process.env.DEPLOY_PRIME_URL || '');
}

function hasPreviewAdminCookie(event) {
  const cookieHeader = event?.headers?.cookie || event?.headers?.Cookie || '';
  return String(cookieHeader).split(';').map((part) => part.trim()).includes(`${PREVIEW_ADMIN_COOKIE}=1`);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const isDeployPreview = isDeployPreviewEnvironment();
  const previewAdminCookiePresent = hasPreviewAdminCookie(event);
  const isAdmin = isDeployPreview && previewAdminCookiePresent;

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      authenticated: isAdmin,
      isAdmin,
      source: isAdmin ? 'preview_admin_cookie' : 'none',
      diagnostics: {
        isDeployPreview,
        previewAdminCookiePresent,
        previewAdminCookieAccepted: isAdmin,
      },
    }),
  };
};
