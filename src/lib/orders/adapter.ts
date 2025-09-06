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

  console.log('Adapter selection:');
  console.log('NETLIFY_DATABASE_URL:', import.meta.env.NETLIFY_DATABASE_URL ? 'SET' : 'NOT SET');
  console.log('VITE_DATABASE_URL:', import.meta.env.VITE_DATABASE_URL ? 'SET' : 'NOT SET');
  console.log('Environment:', import.meta.env.MODE);
  console.log('Is localhost:', window.location.hostname === 'localhost');

  // Check if we're in local development
  const isLocalDev = import.meta.env.MODE === 'development' || window.location.hostname === 'localhost';

  if (isLocalDev) {
    console.log('🔧 Local development detected, using local adapter');
    _adapter = localOrdersAdapter;
    console.log('✅ Using Local adapter (localStorage)');
    return _adapter;
  }

  // For production, try Netlify Function adapter first (most reliable - no CORS issues)
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

  // Fallback to direct Neon if VITE_DATABASE_URL is set (for production)
  const databaseUrl = import.meta.env.VITE_DATABASE_URL;
  if (databaseUrl) {
    try {
      _adapter = neonOrdersAdapter;
      console.log('✅ Using direct Neon adapter');
      return _adapter;
    } catch (error) {
      console.warn('❌ Neon adapter failed, falling back to local', error);
    }
  }

  _adapter = localOrdersAdapter;
  console.log('⚠️ Using local orders adapter (development mode)');

  return _adapter;
}
