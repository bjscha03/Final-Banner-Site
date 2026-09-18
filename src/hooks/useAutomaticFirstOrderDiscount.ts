import { useEffect, useState } from 'react';
import { getCurrentUser } from '@/lib/auth';
import { useCartStore } from '@/store/cart';
import { readCheckoutCustomerDraft, CHECKOUT_CUSTOMER_DRAFT_CHANGED } from '@/components/checkout/checkoutCustomerDraft';
import { readActiveCheckoutMarker } from '@/components/checkout/checkoutPaymentState';

import { FIRST_ORDER_DISCOUNT } from '@/lib/firstOrderPromotion';
type Eligibility = 'unverified' | 'checking' | 'eligible' | 'ineligible' | 'unavailable';
type Identity = { id: string; email?: string } | null | undefined;
const normalize = (value?: string | null) => String(value || '').trim().toLowerCase();

/** Only the NEW20 welcome offer is automatic. Identity is rechecked server-side;
 * manual/recovery offers, artwork, line prices and active payments are untouched. */
export function useAutomaticFirstOrderDiscount({ user, authLoading = false, enabled = true }: {
  user: Identity; authLoading?: boolean; enabled?: boolean;
}) {
  const [liveUser, setLiveUser] = useState(user);
  useEffect(() => setLiveUser(user), [user]);
  const discount = useCartStore(state => state.discountCode);
  const [draftEmail, setDraftEmail] = useState(() => readCheckoutCustomerDraft().email);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; status: Eligibility }>({ key: '', status: 'checking' });
  const email = normalize(draftEmail || liveUser?.email);
  const userId = liveUser?.id || null;
  const key = JSON.stringify([userId, normalize(liveUser?.email), email]);
  const hasIdentity = Boolean(email || userId);

  useEffect(() => {
    const onDraft = (event: Event) => {
      const detail = (event as CustomEvent<{ email: string }>).detail;
      setDraftEmail(detail?.email ?? readCheckoutCustomerDraft().email);
    };
    let active = true;
    const onAccount = () => { void getCurrentUser().then(next => { if (active) setLiveUser(next); }); };
    window.addEventListener(CHECKOUT_CUSTOMER_DRAFT_CHANGED, onDraft);
    window.addEventListener('user-changed', onAccount);
    return () => {
      active = false;
      window.removeEventListener(CHECKOUT_CUSTOMER_DRAFT_CHANGED, onDraft);
      window.removeEventListener('user-changed', onAccount);
    };
  }, []);

  useEffect(() => {
    if (!enabled || authLoading) return;
    // Never reprice an authorization, 3DS flow, or provider retry in progress.
    try { if (readActiveCheckoutMarker()) return; } catch { /* storage may be blocked */ }
    if (!hasIdentity) {
      setResult({ key, status: 'unverified' });
      return;
    }
    setResult({ key, status: 'checking' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(async () => {
      const timeout = window.setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch('/.netlify/functions/validate-discount-code', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          // Check customer eligibility independently of banner size. The
          // existing resolver still picks quantity/other offers without stacking.
          body: JSON.stringify({ code: 'NEW20', userId, email: email || null, items: [] }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error('Eligibility unavailable');
        if (active) setResult({ key, status: data.valid === true && data.discount?.code === 'NEW20'
          ? 'eligible' : data.valid === false ? 'ineligible' : 'unavailable' });
      } catch {
        if (active) setResult({ key, status: 'unavailable' });
      } finally { window.clearTimeout(timeout); }
    }, 300);
    return () => { active = false; window.clearTimeout(timer); controller.abort(); };
  }, [enabled, authLoading, key, hasIdentity, userId, email, retry]);

  const status: Eligibility = authLoading || result.key !== key ? 'checking' : result.status;
  useEffect(() => {
    if (!enabled || status === 'checking') return;
    try { if (readActiveCheckoutMarker()) return; } catch { /* storage may be blocked */ }
    const cart = useCartStore.getState();
    const current = cart.discountCode;
    if (status === 'eligible' || status === 'unverified') {
      if (!current) cart.applyDiscountCode({ ...FIRST_ORDER_DISCOUNT });
    } else if (current?.code.toUpperCase() === 'NEW20') {
      cart.removeDiscountCode();
    }
  }, [enabled, status, key, discount]);

  const isWelcome = !discount || discount.code.toUpperCase() === 'NEW20';
  return {
    status,
    checking: enabled && isWelcome && (status === 'checking'
      || (!discount && (status === 'eligible' || status === 'unverified'))
      || (discount?.code === 'NEW20' && (status === 'ineligible' || status === 'unavailable'))),
    message: status === 'unverified'
      ? 'First-order pricing shown. Eligibility confirmed with your email at checkout.'
      : status === 'checking' ? 'Checking first-order eligibility…'
        : status === 'ineligible' ? 'The first-order offer is not available for this customer. Your price has been updated before payment.'
          : status === 'unavailable' ? 'We could not verify first-order eligibility. The offer has not been applied. Please retry before paying.' : null,
    retry: () => setRetry(value => value + 1),
  };
}
