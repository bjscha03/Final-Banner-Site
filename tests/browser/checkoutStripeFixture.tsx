// Test-only provider boundary. Imported exclusively by vite.checkout.config.ts;
// production always uses Stripe's real hosted, PCI-isolated payment fields.
import React, { useEffect, useRef } from 'react';
const stripe = { createConfirmationToken: async () => { throw new Error('This visual fixture must never submit a payment'); } };
const elements = { submit: async () => { throw new Error('This visual fixture must never submit a payment'); } };
export const loadStripe = async () => stripe;
export const Elements = ({ children }: any) => children;
export const useStripe = () => stripe;
export const useElements = () => elements;
export function ExpressCheckoutElement({ onReady }: any) {
  const ready = useRef(onReady);
  useEffect(() => { ready.current?.({ availablePaymentMethods: { applePay: true } }); }, []);
  return <button type="button" aria-label="Apple Pay test fixture" style={{ background: '#000', color: '#fff', borderRadius: 6, height: 48, width: '100%', fontSize: 21 }}> Pay</button>;
}
export function PaymentElement({ onReady }: any) {
  const ready = useRef(onReady);
  useEffect(() => { ready.current?.(); }, []);
  const style = { border: '1px solid #cdd6e2', borderRadius: 5, height: 44, width: '100%', padding: '10px 12px', fontSize: 16 };
  return <div data-testid="stripe-hosted-fields-fixture" style={{ fontSize: 13, color: '#334155', display: 'grid', gap: 12 }}>
    <label>Card number<input aria-label="Card number fixture" placeholder="1234 1234 1234 1234" style={style} /></label>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <label>Expiration<input aria-label="Expiration fixture" placeholder="MM / YY" style={style} /></label>
      <label>Security code<input aria-label="Security code fixture" placeholder="CVC" style={style} /></label>
    </div>
  </div>;
}
