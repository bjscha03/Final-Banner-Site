import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Demo user for testing
const DEMO_USER = {
  id: 'demo-user-123',
  email: 'brandon.schaefer@hotmail.com',
  user_metadata: {
    full_name: 'Brandon Schaefer'
  }
};

// Demo login state
let demoLoggedIn = false;
let authStateListeners: Array<(event: string, session: any) => void> = [];

// Create a mock client if environment variables are not set
const createMockClient = () => ({
  auth: {
    getUser: () => Promise.resolve({
      data: { user: demoLoggedIn ? DEMO_USER : null },
      error: null
    }),
    signInWithPassword: ({ email, password }: { email: string; password: string }) => {
      if (email === 'brandon.schaefer@hotmail.com' && password === 'pacers31') {
        demoLoggedIn = true;
        // Notify listeners
        setTimeout(() => {
          authStateListeners.forEach(listener =>
            listener('SIGNED_IN', { user: DEMO_USER })
          );
        }, 100);
        return Promise.resolve({ data: { user: DEMO_USER }, error: null });
      }
      return Promise.resolve({ error: { message: 'Invalid demo credentials. Use brandon.schaefer@hotmail.com / pacers31' } });
    },
    signUp: () => Promise.resolve({ error: { message: 'Demo mode: Use brandon.schaefer@hotmail.com / pacers31 to sign in' } }),
    signOut: () => {
      demoLoggedIn = false;
      // Notify listeners
      setTimeout(() => {
        authStateListeners.forEach(listener =>
          listener('SIGNED_OUT', { user: null })
        );
      }, 100);
      return Promise.resolve({ error: null });
    },
    resetPasswordForEmail: () => Promise.resolve({ error: { message: 'Demo mode: Use brandon.schaefer@hotmail.com / pacers31' } }),
    onAuthStateChange: (callback: (event: string, session: any) => void) => {
      authStateListeners.push(callback);
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              authStateListeners = authStateListeners.filter(l => l !== callback);
            }
          }
        }
      };
    },
  },
  from: () => ({
    select: () => ({
      eq: () => ({
        order: () => ({
          range: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  }),
});

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createMockClient();

// Database types
export interface Profile {
  id: string;
  email: string;
  full_name?: string;
  is_admin: boolean;
  created_at: string;
}

export interface Order {
  id: string;
  user_id: string;
  total_cents: number;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  width_in: number;
  height_in: number;
  quantity: number;
  material: string;
  grommets: string;
  rope_feet: number;
  line_total_cents: number;
  created_at: string;
}

export interface OrderWithItems extends Order {
  items: OrderItem[];
  items_preview?: Array<{
    width_in: number;
    height_in: number;
    material: string;
    quantity: number;
  }>;
}
