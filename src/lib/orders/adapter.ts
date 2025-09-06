import type { OrdersAdapter } from './types';
import { localOrdersAdapter } from './local';
import { neonOrdersAdapter } from './neon';
import { neonApiOrdersAdapter } from './neon-api';

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

  // First try Neon Data API (most reliable for production)
  try {
    _adapter = neonApiOrdersAdapter;
    console.log('✅ Using Neon Data API adapter (REST API)');
    return _adapter;
  } catch (error) {
    console.warn('❌ Neon Data API adapter failed, trying fallbacks', error);
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
