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
