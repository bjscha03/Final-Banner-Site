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
        hasStoredUser: !!user,
        hasAdminCookie,
        hostname: typeof window !== 'undefined' ? window.location.hostname : 'unknown',
        cookies: typeof document !== 'undefined' ? document.cookie : 'unavailable',
        storedUser: user ? { id: user.id, email: user.email, is_admin: user.is_admin } : null
      });

      // If no user but admin cookie is present, create a temporary admin user
      if (!user && hasAdminCookie) {
        user = {
          id: 'admin_dev_user',
          email: 'admin@dev.local',
          is_admin: true,
        };
        safeStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(user));
      }

      // Update admin status based on cookie
      if (user && hasAdminCookie) {
        user.is_admin = true;
      }

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

    let user: User | null = null;

    // First, try to find or create user in database using ensure-user
    // Generate a temporary UUID in case we need to create a new user
    const tempUserId = generateUUID();

    try {
      const response = await fetch(getNetlifyFunctionUrl('ensure-user'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: tempUserId,
          email: email,
          full_name: null,
          username: null
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to ensure user in database:', errorText);
        throw new Error(\`Failed to ensure user: \${errorText}\`);
      }

      const result = await response.json();
      console.log('✅ [AUTH] ensure-user response:', result);

      // CRITICAL: Always use the user data returned from the database
      if (result.user) {
        user = {
          id: result.user.id,
          email: result.user.email,
          username: result.user.username,
          full_name: result.user.full_name,
          is_admin: result.user.is_admin || isAdmin,
        };
      } else {
        throw new Error('No user data returned from ensure-user');
      }
    } catch (error) {
      console.error('Failed to ensure user in database:', error);
      throw new Error('Sign-in failed: Unable to create user profile. Please try again.');
    }

    // Check for admin cookie
    if (typeof document !== 'undefined' && document.cookie.includes('admin=1')) {
      user.is_admin = true;
    }

    // Store user in localStorage
    safeStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(user));

    return user;
  }

  async signOut(): Promise<void> {
    safeStorage.removeItem(this.CURRENT_USER_KEY);
  }

  async signUp(email: string, password: string): Promise<User> {
    // For development, sign up is the same as sign in
    return this.signIn(email, password);
  }
}

const adapter = new LocalAuthAdapter();

export async function getCurrentUser(): Promise<User | null> {
  return adapter.getCurrentUser();
}

export async function signIn(email: string, password: string): Promise<User> {
  return adapter.signIn(email, password);
}

export async function signOut(): Promise<void> {
  return adapter.signOut();
}

export async function signUp(email: string, password: string): Promise<User> {
  return adapter.signUp(email, password);
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentUser().then((user) => {
      setUser(user);
      setLoading(false);
    });
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

  const handleSignUp = async (email: string, password: string) => {
    const user = await signUp(email, password);
    setUser(user);
    return user;
  };

  return {
    user,
    loading,
    signIn: handleSignIn,
    signOut: handleSignOut,
    signUp: handleSignUp,
  };
}
