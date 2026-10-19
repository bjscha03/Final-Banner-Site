import { attemptChunkRecovery, installChunkRecovery, isChunkLoadFailure } from './lib/chunkRecovery';

// Start the active configurator download in parallel with the application
// bootstrap. React.lazy will reuse the browser's module cache when it renders
// the route, eliminating an avoidable second network waterfall on mobile.
const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
// This entry runs before main.tsx installs monitoring/React. Catch speculative
// import failures and install recovery first, including failed CSS preloads.
installChunkRecovery();
const recoverPreload = (error: unknown) => {
  if (isChunkLoadFailure(error)) attemptChunkRecovery();
  // React's real route import still reports persistent failures via its boundary.
};

if (pathname === '/google-ads-banner' || pathname === '/fall-festival-banners' || pathname === '/halloween-banner') {
  void import('./pages/GoogleAdsBanner').catch(recoverPreload);
} else if (pathname === '/design') {
  void import('./pages/Design').catch(recoverPreload);
}
