import type { ReactNode } from 'react';
import { usd } from '@/lib/pricing';

/** Keep the provider's original button and guards; only its placement changes. */
export default function CheckoutPaymentBar({ total, children }: { total: number; children: ReactNode }) {
  return <div className="checkout-payment-bar" data-testid="checkout-payment-bar">
    <div className="checkout-payment-bar-total"><span>Total · includes tax</span><strong>{usd(total / 100)}</strong></div>
    {children}
  </div>;
}
