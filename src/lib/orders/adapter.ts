import type { OrdersAdapter } from './types';
import { localOrdersAdapter } from './local';
import { neonOrdersAdapter } from './neon';
import { neonApiOrdersAdapter } from './neon-api';
import { netlifyFunctionOrdersAdapter } from './netlify-function';

// Conditionally import Netlify DB adapter
let netlifyDbOrdersAdapter: OrdersAdapter | null = null;
try {
  netlifyDbOrdersAdapter = require('./netlify-db').netlifyDbOrdersAdapter;
} catch (error) {
}

let _adapter: OrdersAdapter | null = null;

// Function to reset adapter (useful for testing/development)
export function resetOrdersAdapter(): void {
  _adapter = null;
}

export function getOrdersAdapter(): OrdersAdapter {
  // Force reset adapter on localhost to ensure we use the correct one
  const isLocalhost = typeof window !== 'undefined' &&
    (window.location?.hostname === 'localhost' || window.location?.hostname === '127.0.0.1');

  if (isLocalhost) {
    _adapter = null; // Force re-selection on localhost
  }

  if (_adapter) return _adapter;


  // Safe environment variable access
  const getEnvVar = (key: string): string | undefined => {
    try {
      return import.meta.env?.[key];
    } catch (error) {
      console.warn(`Error accessing environment variable ${key}:`, error);
      return undefined;
    }
  };

  const netlifyDbUrl = getEnvVar('NETLIFY_DATABASE_URL');
  const viteDbUrl = getEnvVar('VITE_DATABASE_URL');
  const mode = getEnvVar('MODE');
  const isProd = getEnvVar('PROD');


  // Safe window access for browser environment
  if (typeof window !== 'undefined') {
  }

  // Priority 1: Use local adapter for localhost development
  if (isLocalhost) {
    _adapter = localOrdersAdapter;
    return _adapter;
  }

  // Priority 2: Use Netlify Function adapter for production (works with our fixed get-orders function)
  // This ensures we use the working Netlify functions instead of direct database access
  try {
    _adapter = netlifyFunctionOrdersAdapter;
    return _adapter;
  } catch (error) {
    console.warn('❌ Netlify Function adapter failed:', error);
  }

  // Priority 3: Direct Neon database connection (fallback)
  const databaseUrl = viteDbUrl || netlifyDbUrl;
  if (databaseUrl) {
    try {
      _adapter = neonOrdersAdapter;
      return _adapter;
    } catch (error) {
      console.warn('❌ Direct Neon adapter failed:', error);
    }
  } else {
    console.warn('⚠️ No database URL found - orders will not sync to Neon!');
  }

  // Check if we're in Netlify environment (has NETLIFY_DATABASE_URL) and adapter is available
  if (netlifyDbUrl && netlifyDbOrdersAdapter) {
    try {
      _adapter = netlifyDbOrdersAdapter;
      return _adapter;
    } catch (error) {
      console.warn('❌ Netlify DB adapter failed, trying fallbacks', error);
    }
  }

  // Final fallback to local adapter with enhanced logging
  _adapter = localOrdersAdapter;

  // Test the local adapter to ensure it works
  try {
    // Quick test to ensure localStorage/storage is working
    const testKey = '__orders_adapter_test__';
    const testValue = 'test';

    if (typeof window !== 'undefined') {
      localStorage.setItem(testKey, testValue);
      const retrieved = localStorage.getItem(testKey);
      localStorage.removeItem(testKey);

      if (retrieved === testValue) {
      } else {
        console.warn('⚠️ Local storage test failed - orders may not persist');
      }
    }
  } catch (error) {
    console.warn('⚠️ Local storage test failed:', error);
  }

  return _adapter;
}
