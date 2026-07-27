const TOKEN_KEY = 'banners_server_session';
const ADMIN_SESSION_MESSAGE_KEY = 'banners_admin_session_message';
export const ADMIN_SESSION_EXPIRED_MESSAGE = 'Admin session expired — sign in again';

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

export function clearAdminSession(message = ADMIN_SESSION_EXPIRED_MESSAGE) {
  setServerSessionToken(null);
  if (typeof localStorage !== 'undefined') localStorage.removeItem('banners_current_user');
  if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(ADMIN_SESSION_MESSAGE_KEY, message);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('user-changed'));
}

export function takeAdminSessionMessage(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  const message = sessionStorage.getItem(ADMIN_SESSION_MESSAGE_KEY);
  sessionStorage.removeItem(ADMIN_SESSION_MESSAGE_KEY);
  return message;
}

/** The single transport for every server-protected admin operation. */
export async function adminFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = getServerSessionToken();
  if (!token) {
    clearAdminSession();
    if (typeof window !== 'undefined') window.location.assign('/admin/setup');
    throw new Error(ADMIN_SESSION_EXPIRED_MESSAGE);
  }
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(input, {
    ...init,
    headers,
  });
  if (response.status === 401 || response.status === 403) {
    clearAdminSession();
    if (typeof window !== 'undefined') window.location.assign('/admin/setup');
    throw new Error(ADMIN_SESSION_EXPIRED_MESSAGE);
  }
  return response;
}
