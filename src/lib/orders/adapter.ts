import type { OrdersAdapter } from './types';
import { localOrdersAdapter } from './local';

let _adapter: OrdersAdapter | null = null;

export function getOrdersAdapter(): OrdersAdapter {
  if (_adapter) return _adapter;

  // For development, always use local adapter
  // In production with Supabase env vars, this would switch to Supabase
  const hasSupabase = !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

  if (hasSupabase) {
    console.log('Supabase environment detected, but using local adapter for now');
  }

  _adapter = localOrdersAdapter;
  console.log('Using local orders adapter (development mode)');

  return _adapter;
}
