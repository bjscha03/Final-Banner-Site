import React from 'react';
import { CreditCard, Lock } from 'lucide-react';
import { CheckoutCardDivider } from './CheckoutCardDivider';

/** Design-only controls for the existing no-charge deploy-preview checkout.
 * Never mount a provider SDK or collect card information in this component.
 */
export function PreviewExpressCheckout() {
  return (
    <section aria-label="Express checkout preview">
      <div className="checkout-preview-heading">
        <p className="checkout-express-label">Express checkout</p>
        <span>Preview · no charges</span>
      </div>
      <div className="checkout-express-options has-wallet checkout-preview-wallets">
        <button type="button" disabled aria-label="Apple Pay — preview only" aria-describedby="checkout-preview-note" className="checkout-apple-preview">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.3.75 3.1.81 1.2-.24 2.35-.94 3.63-.85 1.54.12 2.7.73 3.47 1.84-3.17 1.9-2.41 6.07.5 7.24-.58 1.53-1.34 3.05-2.71 3.94l.01-.01ZM12.03 7.25C11.88 4.98 13.72 3.11 15.83 3c.29 2.62-2.38 4.58-3.8 4.25Z" /></svg>
          <span>Pay</span>
        </button>
        <button type="button" disabled aria-label="PayPal — preview only" aria-describedby="checkout-preview-note" className="checkout-paypal-choice">
          <span><span className="text-[#003087]">Pay</span><span className="text-[#0070BA]">Pal</span></span>
        </button>
      </div>
      <p id="checkout-preview-note" className="checkout-preview-note">Payment controls are display-only in this preview.</p>
      <CheckoutCardDivider />
    </section>
  );
}

export function PreviewCardPayment() {
  return (
    <section className="checkout-card-fields" aria-labelledby="checkout-preview-payment-heading">
      <div className="checkout-section-title">
        <span className="flex items-center justify-center rounded-full bg-[#071C35] font-bold text-white" aria-hidden="true">2</span>
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
