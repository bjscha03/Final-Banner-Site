import React, { useMemo } from 'react';
import { Elements, ExpressCheckoutElement, useElements } from '@stripe/react-stripe-js';
import type { Stripe, StripeElements, StripeElementsOptions } from '@stripe/stripe-js';

type WalletProps = Omit<React.ComponentProps<typeof ExpressCheckoutElement>, 'onConfirm'> & {
  onConfirm: (event: any, elements: StripeElements | null) => void;
};

function BoundWallet({ onConfirm, ...props }: WalletProps) {
  const elements = useElements();
  return <ExpressCheckoutElement {...props} onConfirm={(event) => onConfirm(event, elements)} />;
}

// Each native wallet owns its Elements group so Stripe can render it at the
// compact width without imposing a multi-button grid or overflow menu.
export default function IsolatedExpressWallet({ stripe, amount, ...props }: WalletProps & {
  stripe: Stripe | null;
  amount: number;
}) {
  const options = useMemo<StripeElementsOptions>(() => ({
    mode: 'payment', amount, currency: 'usd', allowedPaymentMethodTypes: ['card'],
    appearance: { theme: 'stripe', variables: { borderRadius: '12px' } },
  }), [amount]);
  return <Elements stripe={stripe} options={options}><BoundWallet {...props} /></Elements>;
}
