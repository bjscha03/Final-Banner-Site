export const PREVIEW_ADMIN_COOKIE = 'botf_preview_admin';

export const isDeployPreviewHostname = (hostname: string) =>
  /^deploy-preview-\d+--.+\.netlify\.app$/i.test(hostname);

export const isLocalhostHostname = (hostname: string) =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

export const canUsePreviewAdminPassword = (hostname: string, password: string) =>
  password === 'admin' && (isDeployPreviewHostname(hostname) || isLocalhostHostname(hostname));

export const createPreviewAdminCookie = () =>
  `${PREVIEW_ADMIN_COOKIE}=1; Max-Age=${8 * 60 * 60}; Path=/; SameSite=Lax`;

export const hasPreviewAdminCookie = (cookieHeader: string) =>
  cookieHeader.split(';').map((part) => part.trim()).includes(`${PREVIEW_ADMIN_COOKIE}=1`);
