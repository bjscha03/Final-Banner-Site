import React, { useState } from 'react';
import { CreditCard, Lock } from 'lucide-react';
import { CheckoutCardDivider } from './CheckoutCardDivider';

type PreviewWallet = 'Apple Pay' | 'PayPal';

type PreviewExpressProps = {
  total: number;
  disabled: boolean;
  processing: boolean;
  error: string | null;
  onTestOrder: () => Promise<void>;
};

export function PreviewExpressCheckout({ total, disabled, processing, error, onTestOrder }: PreviewExpressProps) {
  const [selected, setSelected] = useState<PreviewWallet | null>(null);
  const amount = `$${(total / 100).toFixed(2)}`;

  return (
    <section aria-label="Express checkout preview">
      <p className="checkout-express-label">Test express checkout</p>
      <p className="checkout-test-wallet-help">Try a wallet checkout with a no-charge test order.</p>
      <div className="checkout-test-wallets" role="group" aria-label="Test payment method">
        {(['Apple Pay', 'PayPal'] as const).map(method => (
          <button key={method} type="button" disabled={disabled} aria-pressed={selected === method}
            onClick={() => setSelected(method)}>
            Test {method}
          </button>
        ))}
      </div>
      {selected && (
        <section className="checkout-test-wallet-review" aria-label={`${selected} test order`}>
          <p><strong>{selected} test order</strong></p>
          <p>Order total <strong>{amount}</strong>. No wallet will open or be charged.</p>
          <div className="checkout-test-wallet-actions">
            <button type="button" className="checkout-pay-button" disabled={disabled} onClick={onTestOrder}>
              {processing ? 'Placing test order…' : 'Confirm test order'}
            </button>
            <button type="button" disabled={processing} onClick={() => setSelected(null)}>Cancel</button>
          </div>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        </section>
      )}
      <CheckoutCardDivider />
    </section>
  );
}

export function PreviewCardPayment() {
  return (
    <section className="checkout-card-fields" aria-labelledby="checkout-preview-payment-heading">
      <div className="checkout-section-title">
        <span className="flex items-center justify-center rounded-full bg-[#071C35] font-bold text-white" aria-hidden="true">3</span>
        <h4 id="checkout-preview-payment-heading">Payment</h4>
        <CreditCard className="ml-auto h-5 w-5 text-slate-500" aria-hidden="true" />
      </div>
      <div className="checkout-preview-card" role="img" aria-label="Card payment layout preview. Card entry is disabled; no payment information is collected.">
        <div className="checkout-preview-card-number"><span>Card number</span><div>1234 5678 9012 3456<Lock aria-hidden="true" /></div></div>
        <div><span>Expiration date</span><div>MM / YY</div></div>
        <div><span>Security code</span><div>CVC</div></div>
      </div>
    </section>
  );
}
