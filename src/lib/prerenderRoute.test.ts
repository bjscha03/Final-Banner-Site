import { expect, it } from 'vitest';
import { canHydrateRoute } from './prerenderRoute';

it('hydrates only the route represented by the server HTML', () => {
  expect(canHydrateRoute('true', '/products', '/products')).toBe(true);
  expect(canHydrateRoute('true', '/products', '/products/')).toBe(true);
  expect(canHydrateRoute('true', '/products/aluminum-signs', '/products/aluminum-signs')).toBe(true);
  expect(canHydrateRoute('true', '/__not-found__', '/products/solid-aluminum-signs')).toBe(false);
  expect(canHydrateRoute('true', '/__not-found__', '/products/durable-display-posters')).toBe(false);
  expect(canHydrateRoute('true', undefined, '/products')).toBe(false);
  expect(canHydrateRoute(undefined, '/products', '/products')).toBe(false);
});
