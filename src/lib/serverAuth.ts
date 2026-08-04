const TOKEN_KEY = 'banners_server_session';
const CURRENT_USER_KEY = 'banners_current_user';
const SESSION_HEADER = 'X-Banners-Admin-Session';
const SESSION_COOKIE = 'banners_admin_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;

function readStorage(storage: Storage | undefined): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeStorage(storage: Storage | undefined, token?: string | null) {
  if (!storage) return;
  try {
    if (token) storage.setItem(TOKEN_KEY, token);
    else storage.removeItem(TOKEN_KEY);
  } catch {
    // Storage can be unavailable in strict privacy modes. The other storage
    // location may still work, so do not turn sign-in into a hard failure.
  }
}

function writeSessionCookie(token?: string | null) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${SESSION_COOKIE}=${token ? encodeURIComponent(token) : ''}; Path=/; SameSite=Strict; Max-Age=${token ? SESSION_TTL_SECONDS : 0}${secure}`;
  } catch {
    // The dedicated request header remains available if cookies are disabled.
  }
}

function clearStaleAdminIdentity() {
  if (typeof window === 'undefined') return;
  try {
    const rawUser = window.localStorage.getItem(CURRENT_USER_KEY);
    const storedUser = rawUser ? JSON.parse(rawUser) : null;
    if (storedUser?.is_admin === true) {
      window.localStorage.removeItem(CURRENT_USER_KEY);
      window.dispatchEvent(new Event('user-changed'));
    }
  } catch {
    // A malformed or inaccessible stored user should not block the redirect.
  }
}

function redirectToAdminLogin() {
  if (typeof window === 'undefined') return;
  if (!window.location.pathname.startsWith('/admin') || window.location.pathname === '/admin/setup') return;
  window.location.replace('/admin/setup?session=expired');
}

export function setServerSessionToken(token?: string | null) {
  if (typeof window === 'undefined') return;

  // Persist the signed, server-verified token for its eight-hour lifetime so
  // opening the admin preview in a new tab does not leave the durable admin
  // identity in localStorage while losing the token in sessionStorage.
  writeStorage(window.localStorage, token);
  writeStorage(window.sessionStorage, token);
  writeSessionCookie(token);
}

export function getServerSessionToken(): string | null {
  if (typeof window === 'undefined') return null;

  const sessionToken = readStorage(window.sessionStorage);
  if (sessionToken) {
    writeSessionCookie(sessionToken);
    return sessionToken;
  }

  const persistentToken = readStorage(window.localStorage);
  if (persistentToken) {
    // Rehydrate the tab-local copy for existing callers while retaining the
    // persistent copy for other tabs on the same deploy origin.
    writeStorage(window.sessionStorage, persistentToken);
    writeSessionCookie(persistentToken);
    return persistentToken;
  }

  return null;
}

export function authorizedHeaders(headers: Record<string, string> = {}): Record<string, string> {
  const token = getServerSessionToken();
  return token ? {
    ...headers,
    Authorization: `Bearer ${token}`,
    [SESSION_HEADER]: token,
  } : headers;
}

export function authenticatedJsonBody(payload: Record<string, unknown>): string {
  const token = getServerSessionToken();
  return JSON.stringify({
    ...(token ? { adminSessionToken: token } : {}),
    ...payload,
  });
}

/**
 * Fetch helper for authenticated admin endpoints.
 *
 * Keeping the token lookup here prevents individual admin requests from
 * accidentally omitting the session token (notably the dashboard summary
 * requests, which do not go through the orders adapter).
 */
export async function adminFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getServerSessionToken();
  const isAdminPage = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');

  if (!token && isAdminPage) {
    clearStaleAdminIdentity();
    redirectToAdminLogin();
    return new Response(JSON.stringify({ error: 'UNAUTHORIZED', message: 'Admin session required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
    headers.set(SESSION_HEADER, token);
  }

  const response = await fetch(input, { ...init, headers });

  if (response.status === 401 && isAdminPage) {
    setServerSessionToken(null);
    clearStaleAdminIdentity();
    redirectToAdminLogin();
  }

  return response;
}
