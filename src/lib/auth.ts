import { User, AuthAdapter } from './orders/types';
import { useState, useEffect } from 'react';

// Local auth adapter for development
class LocalAuthAdapter implements AuthAdapter {
  private readonly CURRENT_USER_KEY = 'banners_current_user';

  async getCurrentUser(): Promise<User | null> {
    try {
      const stored = localStorage.getItem(this.CURRENT_USER_KEY);
      let user = stored ? JSON.parse(stored) : null;

      // If no user but admin cookie is present, create a temporary admin user
      if (!user && document.cookie.includes('admin=1')) {
        user = {
          id: 'admin_dev_user',
          email: 'admin@dev.local',
          is_admin: true,
        };
        localStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(user));
      }

      // Update admin status based on cookie
      if (user && document.cookie.includes('admin=1')) {
        user.is_admin = true;
      }

      return user;
    } catch (error) {
      console.error('Error reading user from localStorage:', error);
      return null;
    }
  }

  async signIn(email: string, password: string): Promise<User> {
    // In development mode, accept any email/password combination
    // Check for admin flag in email (admin@example.com or contains 'admin')
    const isAdmin = email.toLowerCase().includes('admin');

    const user: User = {
      id: 'dev_user_' + Math.random().toString(36).substr(2, 9),
      email,
      is_admin: isAdmin,
    };

    // Check for admin cookie
    if (document.cookie.includes('admin=1')) {
      user.is_admin = true;
    }

    localStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(user));
    return user;
  }

  async signOut(): Promise<void> {
    localStorage.removeItem(this.CURRENT_USER_KEY);
  }
}

// Adapter selection - always use local for now
let authAdapter: AuthAdapter | null = null;

export async function getAuthAdapter(): Promise<AuthAdapter> {
  if (authAdapter) {
    return authAdapter;
  }

  // For now, always use local adapter since we don't want Supabase
  authAdapter = new LocalAuthAdapter();
  console.log('Using local auth adapter (development mode)');

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

export async function signOut(): Promise<void> {
  const adapter = await getAuthAdapter();
  return adapter.signOut();
}

// React hook for authentication state
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadUser = async () => {
      try {
        const currentUser = await getCurrentUser();
        if (mounted) {
          setUser(currentUser);
        }
      } catch (error) {
        console.error('Error loading user:', error);
        if (mounted) {
          setUser(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadUser();

    return () => {
      mounted = false;
    };
  }, []);

  const handleSignIn = async (email: string, password: string) => {
    const user = await signIn(email, password);
    setUser(user);
    return user;
  };

  const handleSignOut = async () => {
    await signOut();
    setUser(null);
  };

  return {
    user,
    loading,
    signIn: handleSignIn,
    signOut: handleSignOut,
  };
}

// Admin utilities
export function isAdmin(user: User | null): boolean {
  return user?.is_admin === true;
}