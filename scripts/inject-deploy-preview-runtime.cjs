const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MARKER = '/* __BOTF_DEPLOY_PREVIEW_RUNTIME_INJECTION__ */';
const target = path.join(
  process.cwd(),
  'netlify',
  'functions',
  '_shared',
  'admin-session.cjs',
);

if (!fs.existsSync(target)) {
  throw new Error(`Deploy Preview runtime injection target not found: ${target}`);
}

const original = fs.readFileSync(target, 'utf8');
if (original.includes(MARKER)) {
  console.log('[deploy-preview-runtime] Runtime marker already injected.');
  process.exit(0);
}

// Netlify exposes CONTEXT/DEPLOY_* reliably to the build, but those values are
// not guaranteed to be present in the legacy Lambda runtime used by this site.
// Generate one deploy-specific server-only signing value and embed the runtime
// markers in the shared module that both check-admin-status and create-order
// import. Nothing is added to the browser bundle.
const deploySeed = [
  process.env.SITE_ID || 'bannersonthefly',
  process.env.DEPLOY_ID || process.env.BUILD_ID || process.env.COMMIT_REF || 'preview',
  crypto.randomBytes(32).toString('hex'),
].join(':');

const previewSecret = crypto
  .createHash('sha256')
  .update(deploySeed)
  .digest('hex');

const injected = `${MARKER}
process.env.VERCEL_ENV = 'preview';
process.env.NETLIFY_CONTEXT = 'deploy-preview';
process.env.ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || ${JSON.stringify(previewSecret)};

${original}`;

fs.writeFileSync(target, injected, 'utf8');
console.log('[deploy-preview-runtime] Injected preview runtime markers into server functions.');
