import { useEffect, useState, type ReactNode } from 'react';
import { usd } from '@/lib/pricing';

/** Keep the provider's original button and guards; only its placement changes. */
export default function CheckoutPaymentBar({ total, children }: { total: number; children: ReactNode }) {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const editing = /^(INPUT|TEXTAREA|IFRAME)$/.test(document.activeElement?.tagName || '');
      // A short phone or pinch zoom is not a keyboard. Only hide while editing
      // and the unzoomed visual viewport is materially reduced by the keyboard.
      setKeyboardOpen(editing && viewport.scale === 1 && window.innerHeight - viewport.height > 150);
    };
    viewport.addEventListener('resize', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => { viewport.removeEventListener('resize', update); document.removeEventListener('focusin', update); document.removeEventListener('focusout', update); };
  }, []);
  return <div className="checkout-payment-bar" data-testid="checkout-payment-bar" data-keyboard-open={keyboardOpen || undefined}>
    <div className="checkout-payment-bar-total"><span>Total · includes tax</span><strong>{usd(total / 100)}</strong></div>
    {children}
  </div>;
}
