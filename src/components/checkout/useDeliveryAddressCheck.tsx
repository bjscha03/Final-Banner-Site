import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { CustomerFormState } from './checkoutCustomer';
import { applySuggestedAddress, type SuggestedAddress } from './CheckoutAddressInput';
import { writeCheckoutCustomerDraft } from './checkoutCustomerDraft';

export const deliveryAddress = (customer: CustomerFormState): SuggestedAddress => customer.shippingSame
  ? { street: customer.street, street2: customer.street2, city: customer.city, state: customer.state, zip: customer.zip, country: customer.country }
  : { street: customer.shippingStreet, street2: customer.shippingStreet2, city: customer.shippingCity, state: customer.shippingState, zip: customer.shippingZip, country: customer.shippingCountry };

const addressKey = (customer: CustomerFormState) => JSON.stringify(deliveryAddress(customer));
type Review = { key: string; message: string; suggested?: SuggestedAddress | null };
const displayAddress = (address: SuggestedAddress) => [address.street, address.street2, `${address.city}, ${address.state} ${address.zip}`].filter(Boolean).join(', ');

export function useDeliveryAddressCheck(customer: CustomerFormState, setCustomer: Dispatch<SetStateAction<CustomerFormState>>) {
  // Postal validation is a separately activated Google service. Autocomplete
  // works independently; never put an inactive validator in the payment path.
  const enabled = import.meta.env.VITE_CHECKOUT_ADDRESS_VALIDATION_ENABLED === 'true';
  const current = useRef(customer); current.current = customer;
  const approved = useRef('');
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [checking, setChecking] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [checkedKey, setCheckedKey] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  const key = addressKey(customer);
  const visibleReview = review?.key === key ? review : null;
  useEffect(() => {
    if (visibleReview) panel.current?.focus();
  }, [visibleReview]);

  const check = async (): Promise<boolean> => {
    if (!enabled) return true;
    const snapshot = current.current;
    const startedKey = addressKey(snapshot);
    if (approved.current === startedKey) return true;
    if (inFlight.current) return false;
    const address = deliveryAddress(snapshot);
    if (![address.street, address.city, address.state, address.zip].every(value => value.trim())) {
      setNote('Enter your full delivery address before checking it.'); return false;
    }
    inFlight.current = true; setChecking(true); setNote(''); setReview(null);
    controller.current = new AbortController();
    const timer = setTimeout(() => controller.current?.abort(), 6500);
    try {
      const response = await fetch('/.netlify/functions/checkout-address', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, signal: controller.current.signal,
        body: JSON.stringify({ action: 'validate', address, sessionToken: crypto.randomUUID() }) });
      if (!response.ok) throw new Error('unavailable');
      const result = await response.json();
      if (!mounted.current || JSON.stringify(current.current) !== JSON.stringify(snapshot)) return false;
      if (result.valid) {
        approved.current = startedKey; setCheckedKey(startedKey); setNote('Delivery address checked.'); return true;
      }
      setReview({ key: startedKey, message: result.message, suggested: result.suggested });
      return false;
    } catch {
      if (mounted.current && addressKey(current.current) === startedKey) setReview({ key: startedKey,
        message: 'The address checker is temporarily unavailable. Please double-check your delivery address before continuing.' });
      return false;
    } finally {
      clearTimeout(timer); inFlight.current = false;
      if (mounted.current) setChecking(false);
    }
  };

  const accept = (suggested?: SuggestedAddress | null) => {
    if (!visibleReview || addressKey(current.current) !== visibleReview.key) return;
    if (suggested) {
      const next = applySuggestedAddress(current.current, suggested, !current.current.shippingSame);
      setCustomer(next); writeCheckoutCustomerDraft(next);
      // Recheck the corrected address (including the preserved apartment) on payment.
      approved.current = ''; setCheckedKey(''); setNote('Suggested address applied. Check your apartment or suite, then continue.');
    } else {
      approved.current = key; setCheckedKey(key); setNote('You confirmed this delivery address.');
    }
    setReview(null);
  };

  const reviewPanel = <div ref={panel} tabIndex={-1} className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm" aria-label="Delivery address check">
    {visibleReview ? <>
      <p className="font-semibold text-[#0B1F3A]">Review delivery address</p>
      <p role="alert" className="mt-1 text-slate-700">{visibleReview.message}</p>
      <p className="mt-2 break-words"><strong>You entered:</strong> {displayAddress(deliveryAddress(customer))}</p>
      {visibleReview.suggested && <p className="mt-2 break-words"><strong>Suggested:</strong> {displayAddress({ ...visibleReview.suggested, street2: visibleReview.suggested.street2 || deliveryAddress(customer).street2 })}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {visibleReview.suggested && <button type="button" className="min-h-11 rounded-md bg-brand-orange px-3 font-semibold text-white" onClick={() => accept(visibleReview.suggested)}>Use suggested address</button>}
        <button type="button" className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-slate-800" onClick={() => accept()}>Use address as entered</button>
      </div>
      <p className="mt-2 text-xs text-slate-600">You can also edit the address above, then continue to payment.</p>
    </> : <>
      <button type="button" disabled={checking} onClick={() => void check()} className="min-h-9 font-medium text-[#18448D] underline disabled:opacity-60">
        {checking ? 'Checking delivery address…' : 'Check delivery address'}
      </button>
      {(note && (!checkedKey || checkedKey === key)) && <p role="status" className="mt-1 text-xs text-slate-600">{note}</p>}
    </>}
  </div>;
  return { check, checking, reviewPanel: enabled ? reviewPanel : null };
}
