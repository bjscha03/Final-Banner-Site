const TOKEN_KEY = 'banners_server_session';

export function setServerSessionToken(token?: string | null) {
  if (typeof sessionStorage === 'undefined') return;
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export function getServerSessionToken(): string | null {
  return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(TOKEN_KEY);
}

export function authorizedHeaders(headers: Record<string, string> = {}): Record<string, string> {
  const token = getServerSessionToken();
  return token ? { ...headers, Authorization: `Bearer ${token}` } : headers;
}

/**
 * Fetch helper for authenticated admin endpoints.
 *
 * Keeping the token lookup here prevents individual admin requests from
 * accidentally omitting the session token (notably the dashboard summary
 * requests, which do not go through the orders adapter).
 */
export function adminFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getServerSessionToken();

  if (token) headers.set('Authorization', `Bearer ${token}`);

  return fetch(input, { ...init, headers });
}
