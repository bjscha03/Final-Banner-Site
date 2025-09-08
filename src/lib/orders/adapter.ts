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
  console.log('Netlify DB adapter not available in this environment');
}

let _adapter: OrdersAdapter | null = null;

export function getOrdersAdapter(): OrdersAdapter {
  if (_adapter) return _adapter;

  console.log('🔍 ORDERS ADAPTER SELECTION DEBUG:');

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

  console.log('NETLIFY_DATABASE_URL:', netlifyDbUrl ? 'SET' : 'NOT SET');
  console.log('VITE_DATABASE_URL:', viteDbUrl ? 'SET' : 'NOT SET');
  console.log('Environment:', mode);
  console.log('Production:', isProd);

  // Safe window access for browser environment
  if (typeof window !== 'undefined') {
    console.log('Hostname:', window.location?.hostname || 'unknown');
    console.log('Full URL:', window.location?.href || 'unknown');
  }

  // Priority 1: Use Netlify Function adapter (works with our fixed get-orders function)
  // This ensures we use the working Netlify functions instead of direct database access
  try {
    _adapter = netlifyFunctionOrdersAdapter;
    console.log('✅ Using Netlify Function adapter (uses working get-orders function)');
    return _adapter;
  } catch (error) {
    console.warn('❌ Netlify Function adapter failed:', error);
  }

  // Priority 2: Direct Neon database connection (fallback)
  const databaseUrl = viteDbUrl || netlifyDbUrl;
  if (databaseUrl) {
    try {
      _adapter = neonOrdersAdapter;
      console.log('✅ Using direct Neon adapter - ALL ORDERS SYNC THROUGH NEON DATABASE');
      console.log('Database URL source:', viteDbUrl ? 'VITE_DATABASE_URL' : 'NETLIFY_DATABASE_URL');
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
      console.log('✅ Using Netlify DB adapter (Drizzle + Neon)');
      return _adapter;
    } catch (error) {
      console.warn('❌ Netlify DB adapter failed, trying fallbacks', error);
    }
  }

  // Final fallback to local adapter with enhanced logging
  _adapter = localOrdersAdapter;
  console.log('⚠️ Using local orders adapter (development mode)');
  console.log('📝 Local adapter will use browser storage for orders');

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
        console.log('✅ Local storage test passed - orders will persist');
      } else {
        console.warn('⚠️ Local storage test failed - orders may not persist');
      }
    }
  } catch (error) {
    console.warn('⚠️ Local storage test failed:', error);
  }

  return _adapter;
}
