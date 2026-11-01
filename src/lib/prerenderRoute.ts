/** A prerendered 404 may be served at an arbitrary SPA URL. Hydrate only
 * when the HTML was actually generated for the route being opened. */
export function canHydrateRoute(prerendered: string | undefined, renderedPath: string | undefined, pathname: string): boolean {
  const normalize = (path: string) => path.replace(/\/+$/, '') || '/';
  return prerendered === 'true' && typeof renderedPath === 'string'
    && normalize(renderedPath) === normalize(pathname);
}
