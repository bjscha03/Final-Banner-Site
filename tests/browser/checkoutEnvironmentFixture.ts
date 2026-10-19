import { shouldUseDeployPreviewTestCheckout as actualPreviewCheck } from '../../src/components/checkout/checkoutEnvironment';

// Used only by vite.checkout.config.ts. Exercise the real hostname predicate
// and production preview components without requiring Netlify credentials.
export const shouldUseDeployPreviewTestCheckout = () => actualPreviewCheck(
  new URLSearchParams(window.location.search).get('checkoutVisualMode') === 'deploy-preview'
    ? 'deploy-preview-613--bannersonthefly.netlify.app'
    : window.location.hostname,
);
