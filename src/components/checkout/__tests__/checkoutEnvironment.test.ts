import { describe, expect, it } from 'vitest';
import { shouldUseDeployPreviewTestCheckout } from '../checkoutEnvironment';

describe('deploy-preview test checkout selection', () => {
  it('enables the no-payment test checkout on Netlify Deploy Previews without auth or cookies', () => {
    expect(shouldUseDeployPreviewTestCheckout('deploy-preview-357--bannersonthefly.netlify.app')).toBe(true);
  });

  it('keeps the no-payment test checkout absent on production', () => {
    expect(shouldUseDeployPreviewTestCheckout('bannersonthefly.com')).toBe(false);
    expect(shouldUseDeployPreviewTestCheckout('www.bannersonthefly.com')).toBe(false);
  });
});
