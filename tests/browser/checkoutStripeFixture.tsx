// Test-only provider boundary. Imported exclusively by vite.checkout.config.ts;
// production always uses Stripe's real hosted, PCI-isolated payment fields.
import React, { useEffect, useRef } from 'react';
const stripe = { createConfirmationToken: async () => { throw new Error('This visual fixture must never submit a payment'); } };
const elements = { submit: async () => { throw new Error('This visual fixture must never submit a payment'); } };
export const loadStripe = async () => stripe;
export const Elements = ({ children }: any) => children;
export const useStripe = () => stripe;
export const useElements = () => elements;
export function ExpressCheckoutElement({ onReady, options }: any) {
  const ready = useRef(onReady);
  const walletMode = new URLSearchParams(window.location.search).get('walletFixture') || 'both';
  useEffect(() => {
    ready.current?.({ availablePaymentMethods: { applePay: walletMode !== 'none', googlePay: walletMode === 'both' } });
  }, [walletMode]);
  if (walletMode === 'none') return null;
  const wallet = (label: string, type: string) => (
    <button type="button" aria-label={`${label} test fixture`} style={{ background: '#000', color: '#fff', borderRadius: 6, height: options.buttonHeight, width: '100%', minWidth: type === 'plain' ? 100 : 140, whiteSpace: 'nowrap', fontSize: 21 }}>{type === 'plain' ? label : `Buy with ${label}`}</button>
  );
  // Model both eligible native buttons and their minimum widths. A one-wallet
  // fixture missed the real two-wallet clipping regression on phones.
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(walletMode === 'both' ? 2 : 1, options.layout.maxColumns)}, minmax(0, 1fr))`, gap: 12 }}>
    {wallet('Apple Pay', options.buttonType.applePay)}
    {walletMode === 'both' && wallet('Google Pay', options.buttonType.googlePay)}
  </div>;
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
