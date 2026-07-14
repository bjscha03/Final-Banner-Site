export const isNetlifyDeployPreviewHostname = (hostname: string) => (
  /^deploy-preview-\d+--.+\.netlify\.app$/i.test(hostname)
);

export const shouldUseDeployPreviewTestCheckout = (hostname: string | undefined = typeof window !== 'undefined' ? window.location.hostname : undefined) => (
  Boolean(hostname && isNetlifyDeployPreviewHostname(hostname))
);
