// Start the active configurator download in parallel with the application
// bootstrap. React.lazy will reuse the browser's module cache when it renders
// the route, eliminating an avoidable second network waterfall on mobile.
const pathname = window.location.pathname.replace(/\/+$/, '') || '/';

if (pathname === '/google-ads-banner') {
  void import('./pages/GoogleAdsBanner');
} else if (pathname === '/design' || pathname === '/halloween-banner') {
  void import('./pages/Design');
}
