import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';

const NOINDEX_EXACT_PATHS = new Set([
  '/admin',
  '/canva-test',
  '/check-email',
  '/checkout',
  '/design/canva-editor',
  '/design/complete',
  '/forgot-password',
  '/graduation-signs/thank-you',
  '/logo-showcase',
  '/my-ai-images',
  '/my-orders',
  '/order-confirmation',
  '/payment-success',
  '/pdf-diagnostic',
  '/reset-password',
  '/sign-in',
  '/sign-up',
  '/verify-email',
]);

const isPrivateOrUtilityPath = (pathname: string): boolean => (
  NOINDEX_EXACT_PATHS.has(pathname)
  || pathname.startsWith('/admin/')
  || pathname.startsWith('/orders/')
  || pathname.startsWith('/proof/')
);

const RouteRobotsPolicy = () => {
  const { pathname } = useLocation();
  if (!isPrivateOrUtilityPath(pathname)) return null;
  return (
    <Helmet>
      <meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex" />
      <meta name="googlebot" content="noindex, nofollow, noarchive, nosnippet, noimageindex" />
    </Helmet>
  );
};

export default RouteRobotsPolicy;
