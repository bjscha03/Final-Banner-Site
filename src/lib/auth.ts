import { User, AuthAdapter } from './orders/types';
import { useState, useEffect } from 'react';
import { generateUUID, safeStorage } from './utils';

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
      let user = stored ? JSON.parse(stored) : null;

      // Debug logging for production troubleshooting
      const hasAdminCookie = typeof document !== 'undefined' && document.cookie.includes('admin=1');
      console.log('🔍 getCurrentUser Debug:', {
        hasStoredUser: !!user,
        hasAdminCookie,
        hostname: typeof window !== 'undefined' ? window.location.hostname : 'unknown',
        storedUser: user ? { id: user.id, email: user.email, is_admin: user.is_admin } : null
      });

      // If no user but admin cookie is present, create a temporary admin user
      if (!user && hasAdminCookie) {
        console.log('🆕 Creating temporary admin user from cookie');
        user = {
          id: 'admin_dev_user',
          email: 'admin@dev.local',
          is_admin: true,
        };
        safeStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(user));
      }

      // Update admin status based on cookie
      if (user && hasAdminCookie) {
        console.log('🔧 Updating user admin status from cookie');
        user.is_admin = true;
      }

      console.log('✅ getCurrentUser result:', user ? { id: user.id, email: user.email, is_admin: user.is_admin } : null);
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

      // Check for admin cookie to override admin status if needed
      if (typeof document !== 'undefined' && document.cookie.includes('admin=1')) {
        user.is_admin = true;
      }

      console.log('✅ Secure sign-in successful for:', user.email);
      safeStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(user));
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

      const result = await response.json();

      if (!response.ok || !result.ok) {
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
      console.error('Sign-up failed:', error);
      throw error;
    }
  }

  async signOut(): Promise<void> {
    // Remove user from localStorage
    safeStorage.removeItem(this.CURRENT_USER_KEY);

    // Clear admin cookie if it exists
    if (typeof document !== 'undefined') {
      // Set the admin cookie to expire immediately
      document.cookie = 'admin=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax';
      console.log('🍪 Cleared admin cookie during logout');
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

  const loadUser = async () => {
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    } catch (error) {
      console.error('Error loading user:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUser();
  }, []);

  const handleSignIn = async (email: string, password: string) => {
    const user = await signIn(email, password);
    setUser(user);
    return user;
  };

  const handleSignUp = async (email: string, password: string, fullName?: string, username?: string) => {
    const user = await signUp(email, password, fullName, username);
    // Don't auto-sign in after signup - require email verification
    // setUser(user);
    return user;
  };

  const handleSignOut = async () => {
    await signOut();
    setUser(null);
    // Force a reload of user state to ensure UI updates
    await loadUser();
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
