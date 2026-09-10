import { createContext, useContext } from 'react';
import type { OutboundStatus } from '@/lib/outboundSales';

export interface SalesContextValue {
  status: OutboundStatus | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
}

export const SalesContext = createContext<SalesContextValue | null>(null);

export function useSalesContext(): SalesContextValue {
  const value = useContext(SalesContext);
  if (!value) throw new Error('AI Sales Engine pages must render inside SalesShell.');
  return value;
}
