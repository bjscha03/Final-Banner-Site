import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import type { CustomerFormState } from './checkoutCustomer';

export type SuggestedAddress = { street: string; street2?: string; city: string; state: string; zip: string; country: string };
type Suggestion = { id: string; label: string };
type Props = ComponentProps<typeof Input> & { onAddressSelected: (address: SuggestedAddress) => void };

/** Apply the entire selection atomically; never erase a manually entered unit. */
export function applySuggestedAddress(current: CustomerFormState, address: SuggestedAddress, shipping: boolean): CustomerFormState {
  return shipping ? {
    ...current, shippingStreet: address.street, shippingStreet2: address.street2 || current.shippingStreet2,
    shippingCity: address.city, shippingState: address.state, shippingZip: address.zip, shippingCountry: address.country,
  } : {
    ...current, street: address.street, street2: address.street2 || current.street2,
    city: address.city, state: address.state, zip: address.zip, country: address.country,
  };
}

export function CheckoutAddressInput({ onAddressSelected, onChange, onFocus, onBlur, onKeyDown, ...props }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [focused, setFocused] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const token = useRef('');
  const request = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = `${props.id}-suggestions`;
  const helpId = `${props.id}-address-help`;
  const open = focused && suggestions.length > 0;
  const cancel = () => { sequence.current++; request.current?.abort(); setSuggestions([]); setActive(-1); setBusy(false); };
  const session = () => token.current ||= crypto.randomUUID();
  const lookup = async (body: Record<string, string>, signal: AbortSignal) => {
    const response = await fetch('/.netlify/functions/checkout-address', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ ...body, sessionToken: session() }), signal,
    });
    if (!response.ok) throw new Error(response.status === 422 ? 'incomplete' : 'unavailable');
    return response.json();
  };

  useEffect(() => {
    if (!focused || search.trim().length < 4) return;
    const generation = sequence.current;
    const controller = new AbortController(); request.current = controller;
    const timer = window.setTimeout(async () => {
      setBusy(true); setStatus('Searching addresses…');
      try {
        const data = await lookup({ action: 'suggest', query: search.slice(0, 200) }, controller.signal);
        if (sequence.current !== generation || controller.signal.aborted) return;
        setSuggestions(data.suggestions || []); setActive(-1);
        setStatus(data.suggestions?.length ? 'Choose your address below.' : 'No matches. Add your city or ZIP, or enter the address manually.');
      } catch {
        if (sequence.current !== generation || controller.signal.aborted) return;
        setStatus('Address suggestions are unavailable. You can enter your address manually.');
      } finally {
        if (sequence.current === generation && !controller.signal.aborted) setBusy(false);
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search, focused]);

  useEffect(() => () => { sequence.current++; request.current?.abort(); }, []);

  const select = async (suggestion: Suggestion) => {
    cancel(); setSearch('');
    const generation = sequence.current;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setStatus('Filling in your address…');
    // Keep focus out of a disappearing option, including touch selections.
    input.current?.focus();
    try {
      const data = await lookup({ action: 'details', placeId: suggestion.id }, controller.signal);
      if (sequence.current !== generation || controller.signal.aborted) return;
      onAddressSelected(data.address);
      setStatus('Address filled in. Check your house number and add an apartment or suite if needed.');
    } catch (error) {
      if (sequence.current !== generation || controller.signal.aborted) return;
      setStatus(error instanceof Error && error.message === 'incomplete'
        ? 'That match is missing delivery details. Enter your full street address, city, state, and ZIP.'
        : 'Could not fill that address. Please enter it manually.');
    } finally {
      if (sequence.current === generation) { token.current = ''; setBusy(false); }
    }
  };

  return <div className="relative" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setFocused(false); cancel(); setSearch('');
    }
  }}>
    <Input {...props} ref={input} role="combobox" aria-autocomplete="list" aria-expanded={open}
      aria-controls={open ? listId : undefined} aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
      aria-busy={busy} aria-describedby={[props['aria-describedby'], helpId].filter(Boolean).join(' ')}
      autoComplete={props.autoComplete}
      onFocus={event => { setFocused(true); onFocus?.(event); }}
      onBlur={onBlur}
      onChange={event => { cancel(); setSearch(event.target.value); setStatus(''); onChange?.(event); }}
      onKeyDown={event => {
        if (open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
          event.preventDefault(); setActive(index => (index + (event.key === 'ArrowDown' ? 1 : suggestions.length - 1) + suggestions.length) % suggestions.length);
        } else if (open && event.key === 'Enter' && active >= 0) {
          event.preventDefault(); void select(suggestions[active]);
        } else if (event.key === 'Escape') {
          if (open) event.preventDefault(); cancel(); setSearch(''); setStatus('You can enter your address manually.');
        } else { onKeyDown?.(event); }
      }} />
    {open && <div className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
      <ul id={listId} role="listbox" aria-label="Matching addresses" className="max-h-64 overflow-y-auto">
        {suggestions.map((suggestion, index) => <li key={suggestion.id} role="option" id={`${listId}-${index}`}
          aria-selected={index === active} tabIndex={-1}
          className={`min-h-12 cursor-pointer border-b border-slate-100 px-3 py-3 text-sm leading-5 text-slate-800 ${index === active ? 'bg-orange-50' : 'hover:bg-slate-50'}`}
          onMouseDown={event => event.preventDefault()} onClick={() => void select(suggestion)}>
          {suggestion.label}
        </li>)}
      </ul>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button type="button" className="min-h-9 text-xs text-[#18448D] underline" onClick={() => { cancel(); setSearch(''); setStatus('Enter your address in the fields below.'); input.current?.focus(); }}>Enter manually</button>
        <img src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png" alt="Powered by Google" width="120" height="14" />
      </div>
    </div>}
    <p id={helpId} role="status" aria-live="polite" className="mt-1 text-xs font-normal leading-5 text-slate-600">
      {status || 'Start typing your street address and select a match, or enter it manually.'}
    </p>
  </div>;
}
