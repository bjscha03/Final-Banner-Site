import type { OrdersAdapter } from './types';

let _adapter: OrdersAdapter | null = null;

export function getOrdersAdapter(): OrdersAdapter {
  if (_adapter) return _adapter;

  const hasSupabase = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (hasSupabase) {
    // lazy import to avoid bundling in dev
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _adapter = require('./supabase').supabaseOrdersAdapter;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _adapter = require('./local').localOrdersAdapter;
  }
  return _adapter!;
}
