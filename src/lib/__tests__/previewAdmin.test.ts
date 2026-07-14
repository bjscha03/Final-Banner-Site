import { describe, expect, it } from 'vitest';
import { canUsePreviewAdminPassword, createPreviewAdminCookie, PREVIEW_ADMIN_COOKIE } from '../previewAdmin';

describe('previewAdmin', () => {
  it('allows password admin on Netlify Deploy Preview hostnames', () => {
    expect(canUsePreviewAdminPassword('deploy-preview-356--bannersonthefly.netlify.app', 'admin')).toBe(true);
  });

  it('allows password admin on localhost development', () => {
    expect(canUsePreviewAdminPassword('localhost', 'admin')).toBe(true);
  });

  it('rejects incorrect passwords', () => {
    expect(canUsePreviewAdminPassword('deploy-preview-356--bannersonthefly.netlify.app', 'wrong')).toBe(false);
  });

  it('rejects the preview admin password on production', () => {
    expect(canUsePreviewAdminPassword('bannersonthefly.com', 'admin')).toBe(false);
  });

  it('creates the expected temporary preview admin cookie', () => {
    expect(createPreviewAdminCookie()).toContain(`${PREVIEW_ADMIN_COOKIE}=1`);
    expect(createPreviewAdminCookie()).toContain('Max-Age=28800');
    expect(createPreviewAdminCookie()).toContain('Path=/');
    expect(createPreviewAdminCookie()).toContain('SameSite=Lax');
  });
});
