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

    // Generate a proper UUID for the user
    const userId = crypto.randomUUID();

    const user: User = {
      id: userId,
      email,
      is_admin: isAdmin,
    };

    // Check for admin cookie
    if (document.cookie.includes('admin=1')) {
      user.is_admin = true;
    }

    // Create user profile in database
    try {
      const response = await fetch('/.netlify/functions/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: user.id,
          email: user.email,
          full_name: null,
          is_admin: user.is_admin,
          is_signup: false,
        }),
      });

      if (!response.ok) {
        console.warn('Failed to create user profile in database:', await response.text());
      } else {
        console.log('User profile created/updated in database');
      }
    } catch (error) {
      console.warn('Error creating user profile:', error);
      // Don't block sign-in if profile creation fails
    }

    localStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(user));
    return user;
  }

  async signUp(email: string, password: string, fullName?: string): Promise<User> {
    // In development mode, create a new user account
    const isAdmin = email.toLowerCase().includes('admin');

    // Generate a proper UUID for the user
    const userId = crypto.randomUUID();

    const user: User = {
      id: userId,
      email,
      full_name: fullName,
      is_admin: isAdmin,
    };

    // Check for admin cookie
    if (document.cookie.includes('admin=1')) {
      user.is_admin = true;
    }

    // Create user profile in database
    try {
      const response = await fetch('/.netlify/functions/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          is_admin: user.is_admin,
          is_signup: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to create user profile in database:', errorText);
        throw new Error('Failed to create user account');
      } else {
        console.log('User profile created in database');
      }
    } catch (error) {
      console.error('Error creating user profile:', error);
      throw new Error('Failed to create user account');
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

export async function signUp(email: string, password: string, fullName?: string): Promise<User> {
  const adapter = await getAuthAdapter();
  return (adapter as LocalAuthAdapter).signUp(email, password, fullName);
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

  const handleSignUp = async (email: string, password: string, fullName?: string) => {
    const user = await signUp(email, password, fullName);
    setUser(user);
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