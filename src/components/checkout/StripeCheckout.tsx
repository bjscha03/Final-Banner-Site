import React from 'react';

interface StripeCheckoutProps {
  total: number;
  onSuccess: (orderId: string, orderData?: any) => void;
  onError: (error: any) => void;
  disabled?: boolean;
  onSwitchToPayPal?: () => void;
  showCardForm?: boolean;
  showWallets?: boolean;
}

/**
 * Retained only as a compile-time compatibility shim for older Checkout code.
 * Banners on the Fly is PayPal-only. This component imports no Stripe SDK,
 * creates no payment intent, renders no payment UI, and performs no network call.
 */
const StripeCheckout: React.FC<StripeCheckoutProps> = () => null;

export default StripeCheckout;
