import { User, AuthAdapter } from './orders/types';
import { useState, useEffect } from 'react';
import { safeStorage } from './utils';
import { getServerSessionToken, setServerSessionToken } from './serverAuth';

// This is only a browser recovery check. Server endpoints verify the token's
// signature and permissions before returning orders or changing a wallet.
function browserSession(token: string | null): { sub: string; exp: number } | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const bytes = Uint8Array.from(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof payload.sub !== 'string' || !Number.isFinite(payload.exp)) return null;
    return payload;
  } catch {
    return null;
  }
}

function previewAdminReview(user: User): boolean {
  return user.is_admin === true && typeof window !== 'undefined' && typeof document !== 'undefined'
    && /^deploy-preview-\d+--.+\.netlify\.app$/i.test(window.location.hostname)
    && /(?:^|;\s*)botf_preview_admin=1(?:;|$)/.test(document.cookie);
}

const console = {
  log: import.meta.env.DEV ? globalThis.console.log.bind(globalThis.console) : (..._args: unknown[]) => undefined,
  warn: globalThis.console.warn.bind(globalThis.console),
  error: globalThis.console.error.bind(globalThis.console),
};

// Get the correct base URL for Netlify functions
const getNetlifyFunctionUrl = (functionName: string): string => {
  // In development, Netlify functions run on port 8888
  // In production, they're available at the same domain
  if (typeof window !== 'undefined') {
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isDev) {
      return `http://localhost:8888/.netlify/functions/${functionName}`;
    }
  }
  return `/.netlify/functions/${functionName}`;
};

// Secure auth adapter with proper password validation
class SecureAuthAdapter implements AuthAdapter {
  private readonly CURRENT_USER_KEY = 'banners_current_user';

  async getCurrentUser(): Promise<User | null> {
    try {
      const stored = safeStorage.getItem(this.CURRENT_USER_KEY);
      let user: User | null = null;

      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          const parsedId = typeof parsed?.id === 'string' ? parsed.id.trim() : '';
          const parsedEmail = typeof parsed?.email === 'string' ? parsed.email.trim() : '';

          const parsedIsAdmin = parsed?.is_admin === true;
          if (!parsedId || (!parsedEmail && !parsedIsAdmin)) {
            console.warn('Malformed stored user missing required identity fields; clearing banners_current_user');
            safeStorage.removeItem(this.CURRENT_USER_KEY);
          } else {
            user = {
              id: parsedId,
              email: parsedEmail.toLowerCase(),
              full_name: typeof parsed?.full_name === 'string' ? parsed.full_name : undefined,
              username: typeof parsed?.username === 'string' ? parsed.username : undefined,
              is_admin: parsedIsAdmin,
            };
          }
        } catch (parseError) {
          console.warn('Malformed JSON in banners_current_user; clearing value', parseError);
          safeStorage.removeItem(this.CURRENT_USER_KEY);
        }
      }

      const token = getServerSessionToken();
      const session = browserSession(token);
      if ((!user || !previewAdminReview(user)) && (!user || !session || session.sub !== user.id || session.exp * 1000 <= Date.now())) {
        const hadIdentity = !!stored || !!token;
        safeStorage.removeItem(this.CURRENT_USER_KEY);
        setServerSessionToken(null);
        if (hadIdentity && typeof window !== 'undefined') window.dispatchEvent(new Event('user-changed'));
        return null;
      }

      // Debug logging for production troubleshooting
      const hasAdminCookie = false; // Legacy unsigned admin cookies are intentionally ignored.
      if (import.meta.env.DEV) console.log('🔍 getCurrentUser Debug:', {
        hasStoredUser: !!user,
        hasAdminCookie,
        hostname: typeof window !== 'undefined' ? window.location.hostname : 'unknown',
        storedUser: user ? { id: user.id, email: user.email, is_admin: user.is_admin } : null
      });


      // 🔧 MIGRATION: Update old demo user IDs to valid UUIDs
      if (user && (user.id === 'admin_dev_user' || user.id === 'demo-user-123')) {
        console.log('🔄 Migrating old user ID to valid UUID:', user.id);
        const newId = user.id === 'admin_dev_user' 
          ? '00000000-0000-0000-0000-000000000001'
          : '00000000-0000-0000-0000-000000000002';
        user.id = newId;
        safeStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(user));
        console.log('✅ Migrated user ID to:' , newId);
      }

      if (import.meta.env.DEV) console.log('✅ getCurrentUser result:', user ? { id: user.id, email: user.email, is_admin: user.is_admin } : null);

      return user;
    } catch (error) {
      console.error('Error reading user from storage:', error);
      return null;
    }
  }

  async signIn(email: string, password: string): Promise<User> {
    console.log('🔍 SIGN IN: Starting secure sign in for', email);

    try {
      // Call the secure sign-in function
      const response = await fetch(getNetlifyFunctionUrl('sign-in'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Sign-in failed');
      }

      const user: User = result.user;
      setServerSessionToken(result.sessionToken || null);


      console.log('✅ Secure sign-in successful for:', user.email);
      safeStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(user));
      
      // Dispatch custom event to notify useAuth hook
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('user-changed'));
      }
      
      return user;

    } catch (error) {
      console.error('Sign-in failed:', error);
      throw error;
    }
  }

  async signUp(email: string, password: string, fullName?: string, username?: string): Promise<User> {
    console.log('🔍 SIGN UP: Starting secure sign up for', email);

    try {
      // Call the secure sign-up function
      const response = await fetch(getNetlifyFunctionUrl('sign-up'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName, username })
      });

      console.log('🔍 SIGN UP: Response status:', response.status, response.ok);
      
      const result = await response.json();
      
      console.log('🔍 SIGN UP: Response body:', result);

      if (!response.ok || !result.ok) {
        console.error('❌ SIGN UP: Failed -', 'response.ok:', response.ok, 'result.ok:', result.ok, 'error:', result.error);
        throw new Error(result.error || 'Sign-up failed');
      }

      console.log('✅ Secure sign-up successful for:', email);
      
      // Return a temporary user object (user will need to verify email before signing in)
      const user: User = {
        id: 'temp_' + email,
        email,
        username,
        full_name: fullName,
        is_admin: false
      };

      // Do not store user in localStorage - they need to verify email first
      return user;

    } catch (error) {
      console.error('❌ SIGN UP: Exception caught:', error);
      throw error;
    }
  }

  async signOut(): Promise<void> {
    // Clear every copy of the signed server credential before exposing the
    // browser as signed out. Otherwise authorizedHeaders() can continue to
    // authenticate guest cart/payment requests as the previous account.
    setServerSessionToken(null);

    // Remove user from localStorage
    safeStorage.removeItem(this.CURRENT_USER_KEY);
    
    // Remove cart owner ID from localStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('cart_owner_user_id');
      console.log('🚪 Cleared cart owner ID from localStorage');
    }

    // Clear admin cookie if it exists
    if (typeof document !== 'undefined') {
      // Set the admin cookie to expire immediately
      document.cookie = 'admin=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax';
      console.log('🍪 Cleared admin cookie during logout');
    }
    
    // Dispatch custom event to notify useAuth hook
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('user-changed'));
    }
  }
}

// Adapter selection - use secure adapter
let authAdapter: AuthAdapter | null = null;

export async function getAuthAdapter(): Promise<AuthAdapter> {
  if (authAdapter) {
    return authAdapter;
  }

  authAdapter = new SecureAuthAdapter();
  console.log('Using secure auth adapter with proper password validation');

  return authAdapter;
}

// Convenience functions
export async function getCurrentUser(): Promise<User | null> {
  const adapter = await getAuthAdapter();
  return adapter.getCurrentUser();
}

export async function signIn(email: string, password: string): Promise<User> {
  const adapter = await getAuthAdapter();
  return adapter.signIn(email, password);
}

export async function signUp(email: string, password: string, fullName?: string, username?: string): Promise<User> {
  const adapter = await getAuthAdapter();
  return (adapter as SecureAuthAdapter).signUp(email, password, fullName, username);
}

export async function signOut(): Promise<void> {
  const adapter = await getAuthAdapter();
  return adapter.signOut();
}

// React hook for authentication state
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let current = true;
    let loadVersion = 0;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    let storageTimer: ReturnType<typeof setTimeout> | undefined;
    const loadUser = async () => {
      const version = ++loadVersion;
      clearTimeout(expiryTimer);
      try {
        const currentUser = await getCurrentUser();
        if (!current || version !== loadVersion) return;
        setUser(currentUser);
        const session = currentUser ? browserSession(getServerSessionToken()) : null;
        if (session) expiryTimer = setTimeout(() => void loadUser(), Math.min(2_147_483_647, Math.max(0, session.exp * 1000 - Date.now() + 50)));
      } catch (error) {
        if (!current || version !== loadVersion) return;
        console.error('Error loading user:', error);
        setUser(null);
      } finally {
        if (current && version === loadVersion) setLoading(false);
      }
    };
    const identityChanged = () => void loadUser();
    const storageChanged = (event: StorageEvent) => {
      if (event.key !== null && !['banners_current_user', 'banners_server_session'].includes(event.key)) return;
      // Another tab writes the token and profile together. Read their final
      // snapshot after the storage events rather than keeping this tab's old
      // sessionStorage credential or reacting to half of an account switch.
      clearTimeout(storageTimer);
      ++loadVersion;
      storageTimer = setTimeout(() => {
        if (!current) return;
        setServerSessionToken(safeStorage.getItem('banners_server_session'));
        void loadUser();
      }, 0);
    };
    const visibilityChanged = () => { if (!document.hidden) void loadUser(); };
    window.addEventListener('user-changed', identityChanged);
    window.addEventListener('storage', storageChanged);
    window.addEventListener('focus', identityChanged);
    document.addEventListener('visibilitychange', visibilityChanged);
    void loadUser();
    return () => {
      current = false;
      ++loadVersion;
      clearTimeout(expiryTimer);
      clearTimeout(storageTimer);
      window.removeEventListener('user-changed', identityChanged);
      window.removeEventListener('storage', storageChanged);
      window.removeEventListener('focus', identityChanged);
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, []);

  const handleSignIn = async (email: string, password: string) => {
    return signIn(email, password);
  };

  const handleSignUp = async (email: string, password: string, fullName?: string, username?: string) => {
    const user = await signUp(email, password, fullName, username);
    // Don't auto-sign in after signup - require email verification
    // setUser(user);
    return user;
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return {
    user,
    loading,
    signIn: handleSignIn,
    signUp: handleSignUp,
    signOut: handleSignOut,
  };
}

// Admin utilities
export function isAdmin(user: User | null): boolean {
  return user?.is_admin === true;
}
