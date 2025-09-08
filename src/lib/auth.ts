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

// Local auth adapter for development
class LocalAuthAdapter implements AuthAdapter {
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
        cookies: typeof document !== 'undefined' ? document.cookie : 'unavailable',
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
    // In development mode, accept any email/password combination
    // Check for admin flag in email (admin@example.com or contains 'admin')
    const isAdmin = email.toLowerCase().includes('admin');

    console.log('🔍 SIGN IN DEBUG: Starting sign in for', email);

    // CRITICAL FIX: First check if user already exists in database
    let user: User | null = null;

    // Skip the debug-user lookup since that function doesn't exist
    // We'll let the ensure-user function handle finding/creating users

    // Always create/ensure user exists in database
    console.log('🆕 Creating/ensuring user for', email);
    const userId = generateUUID();

    user = {
      id: userId,
      email,
      is_admin: isAdmin,
    };

    // Create user in database using ensure-user function
    try {
      const response = await fetch(getNetlifyFunctionUrl('ensure-user'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          username: user.username
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to create user in database:', errorText);

        // If user already exists, try to get the existing user ID
        if (errorText.includes('already exists')) {
          console.log('User already exists, will use create-user function to get existing user');
        } else {
          throw new Error(`Failed to ensure user: ${errorText}`);
        }
      } else {
        const result = await response.json();
        console.log('✅ User ensured in database:', result);

        // Use the returned user data if available
        if (result.user) {
          user.id = result.user.id;
          user.username = result.user.username;
          user.full_name = result.user.full_name;
        }
      }
    } catch (error) {
      console.error('Failed to ensure user in database:', error);
      throw new Error('Sign-in failed: Unable to create user profile. Please try again.');
    }

    // Check for admin cookie
    if (typeof document !== 'undefined' && document.cookie.includes('admin=1')) {
      user.is_admin = true;
    }

    // CRITICAL FIX: Ensure user profile is created in database before proceeding
    try {
      const response = await fetch(getNetlifyFunctionUrl('create-user'), {
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
        const errorText = await response.text();
        console.error('Failed to create user profile in database:', errorText);

        // If user already exists, that's fine - continue with sign-in
        if (!errorText.includes('already exists')) {
          throw new Error(`Failed to create user profile: ${errorText}`);
        } else {
          console.log('User profile already exists in database - continuing with sign-in');
        }
      } else {
        console.log('User profile created/updated in database successfully');
      }
    } catch (error) {
      console.error('CRITICAL ERROR: Cannot create user profile in database:', error);
      throw new Error('Sign-in failed: Unable to create user profile. Please try again.');
    }

    safeStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(user));
    return user;
  }

  async signUp(email: string, password: string, fullName?: string, username?: string): Promise<User> {
    // In development mode, create a new user account
    const isAdmin = email.toLowerCase().includes('admin');

    // Generate a proper UUID for the user ID
    const userId = generateUUID();

    const user: User = {
      id: userId,
      email,
      username,
      full_name: fullName,
      is_admin: isAdmin,
    };

    // Check for admin cookie
    if (typeof document !== 'undefined' && document.cookie.includes('admin=1')) {
      user.is_admin = true;
    }

    // Create user profile in database
    try {
      const response = await fetch(getNetlifyFunctionUrl('create-user'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: user.id,
          email: user.email,
          username: user.username,
          full_name: user.full_name,
          is_admin: user.is_admin,
          is_signup: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to create user profile in database:', errorText);

        // If user already exists, that's an error for signup
        if (errorText.includes('already exists')) {
          throw new Error('An account with this email address already exists. Please sign in instead.');
        } else {
          throw new Error(`Failed to create user account: ${errorText}`);
        }
      } else {
        console.log('User profile created in database successfully');
      }
    } catch (error) {
      console.error('Error creating user profile:', error);
      if (error.message.includes('already exists')) {
        throw error; // Re-throw the specific error message
      }
      throw new Error('Failed to create user account. Please try again.');
    }

    safeStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(user));
    return user;
  }

  async signOut(): Promise<void> {
    safeStorage.removeItem(this.CURRENT_USER_KEY);
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

export async function signUp(email: string, password: string, fullName?: string, username?: string): Promise<User> {
  const adapter = await getAuthAdapter();
  return (adapter as LocalAuthAdapter).signUp(email, password, fullName, username);
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