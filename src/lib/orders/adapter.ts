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
  console.log('NETLIFY_DATABASE_URL:', import.meta.env.NETLIFY_DATABASE_URL ? 'SET' : 'NOT SET');
  console.log('VITE_DATABASE_URL:', import.meta.env.VITE_DATABASE_URL ? 'SET' : 'NOT SET');
  console.log('Environment:', import.meta.env.MODE);
  console.log('Production:', import.meta.env.PROD);
  console.log('Hostname:', window.location.hostname);
  console.log('Full URL:', window.location.href);

  // Priority 1: Direct Neon database connection (both dev and production)
  const databaseUrl = import.meta.env.VITE_DATABASE_URL || import.meta.env.NETLIFY_DATABASE_URL;
  if (databaseUrl) {
    try {
      _adapter = neonOrdersAdapter;
      console.log('✅ Using direct Neon adapter - ALL ORDERS SYNC THROUGH NEON DATABASE');
      console.log('Database URL source:', import.meta.env.VITE_DATABASE_URL ? 'VITE_DATABASE_URL' : 'NETLIFY_DATABASE_URL');
      return _adapter;
    } catch (error) {
      console.warn('❌ Direct Neon adapter failed:', error);
    }
  } else {
    console.warn('⚠️ No database URL found - orders will not sync to Neon!');
  }

  // Try Netlify Function adapter (for production or when database URL not available)
  try {
    _adapter = netlifyFunctionOrdersAdapter;
    console.log('✅ Using Netlify Function adapter (serverless functions)');
    return _adapter;
  } catch (error) {
    console.warn('❌ Netlify Function adapter failed, trying fallbacks', error);
  }

  // Check if we're in Netlify environment (has NETLIFY_DATABASE_URL) and adapter is available
  if (import.meta.env.NETLIFY_DATABASE_URL && netlifyDbOrdersAdapter) {
    try {
      _adapter = netlifyDbOrdersAdapter;
      console.log('✅ Using Netlify DB adapter (Drizzle + Neon)');
      return _adapter;
    } catch (error) {
      console.warn('❌ Netlify DB adapter failed, trying fallbacks', error);
    }
  }

  // This fallback section is no longer needed since we handle database URL above

  _adapter = localOrdersAdapter;
  console.log('⚠️ Using local orders adapter (development mode)');

  return _adapter;
}
