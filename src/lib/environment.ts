const PRODUCTION_HOSTS = new Set([
  'bannersonthefly.com',
  'www.bannersonthefly.com',
]);

const PREVIEW_CONTEXTS = new Set(['deploy-preview', 'branch-deploy']);

function normalizeHost(hostname: string | null | undefined): string {
  return (hostname || '').toLowerCase();
}

export function isProductionHost(hostname: string | null | undefined): boolean {
  return PRODUCTION_HOSTS.has(normalizeHost(hostname));
}

export function isPreviewEnvironment(hostname?: string | null): boolean {
  const host = normalizeHost(hostname ?? (typeof window !== 'undefined' ? window.location.hostname : ''));

  if (isProductionHost(host)) return false;

  // Netlify preview host patterns
  if (host.includes('deploy-preview')) return true;
  if (host.includes('--') && host.endsWith('.netlify.app')) return true;

  // Netlify build context hints (if surfaced in env vars)
  const rawContext =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.CONTEXT) ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_NETLIFY_CONTEXT) ||
    (typeof process !== 'undefined' ? process.env?.CONTEXT : undefined) ||
    (typeof process !== 'undefined' ? process.env?.NETLIFY_CONTEXT : undefined);

  const context = String(rawContext || '').toLowerCase();
  return PREVIEW_CONTEXTS.has(context);
}

