import React from 'react';
import OriginalPayPalCheckout from './PayPalCheckout';

type PayPalCheckoutProps = {
  total: number;
  onSuccess: (orderId: string, orderData?: any) => void;
  onError: (error: any) => void;
  disabled?: boolean;
  cardFirstLayout?: boolean;
};

/**
 * Preserve the existing import path without adding a second merchant-owned
 * contact or shipping form. The black PayPal "Debit or Credit Card" button is
 * the single place where card customers enter their email and payment details;
 * PayPal's approval flow also supplies the payer/shipping details returned by
 * the Orders API after approval and capture.
 */
const PayPalCheckoutContact: React.FC<PayPalCheckoutProps> = (props) => (
  <OriginalPayPalCheckout {...props} />
);

export default PayPalCheckoutContact;
