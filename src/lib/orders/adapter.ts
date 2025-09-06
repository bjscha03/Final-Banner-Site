import type { OrdersAdapter } from './types';
import { localOrdersAdapter } from './local';
import { neonOrdersAdapter } from './neon';

let _adapter: OrdersAdapter | null = null;

export function getOrdersAdapter(): OrdersAdapter {
  if (_adapter) return _adapter;

  // Check for Netlify/Neon database configuration
  const databaseUrl = import.meta.env.NETLIFY_DATABASE_URL || import.meta.env.VITE_DATABASE_URL;

  if (databaseUrl) {
    try {
      _adapter = neonOrdersAdapter;
      console.log('Using Neon database adapter (production mode)');
      return _adapter;
    } catch (error) {
      console.warn('Neon adapter failed to initialize, falling back to local adapter');
    }
  }

  _adapter = localOrdersAdapter;
  console.log('Using local orders adapter (development mode)');

  return _adapter;
}
