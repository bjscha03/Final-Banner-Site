import React, { useMemo, useRef, useState } from 'react';
import {
  PayPalButtons,
  PayPalCardFieldsForm,
  PayPalCardFieldsProvider,
  PayPalScriptProvider,
  usePayPalCardFields,
} from '@paypal/react-paypal-js';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/auth';
import { useCartStore } from '@/store/cart';
import { getStoredAttribution } from '@/lib/attribution';

interface Props {
  total: number;
  onSuccess: (orderId: string, orderData?: any) => void;
  onError: (error: any) => void;
  disabled?: boolean;
  cardFirstLayout?: boolean;
}

type CustomerForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  shippingSameAsBilling: boolean;
  shippingFirstName: string;
  shippingLastName: string;
  shippingAddress1: string;
  shippingAddress2: string;
  shippingCity: string;
  shippingState: string;
  shippingPostalCode: string;
  shippingCountry: string;
};

const initialForm: CustomerForm = {
  firstName: '', lastName: '', email: '', phone: '', address1: '', address2: '', city: '', state: '', postalCode: '', country: 'US',
  shippingSameAsBilling: true,
  shippingFirstName: '', shippingLastName: '', shippingAddress1: '', shippingAddress2: '', shippingCity: '', shippingState: '', shippingPostalCode: '', shippingCountry: 'US',
};

const InlineSubmit: React.FC<{ disabled: boolean; validate: () => boolean }> = ({ disabled, validate }) => {
  const { cardFieldsForm } = usePayPalCardFields();
  return (
    <Button
      type="button"
      className="mt-4 w-full"
      size="lg"
      disabled={disabled || !cardFieldsForm}
      onClick={() => {
        if (validate()) void cardFieldsForm?.submit();
      }}
    >
      Pay Now
    </Button>
  );
};

const fieldClass = 'h-12';

const PayPalCheckoutComplete: React.FC<Props> = ({ total, onSuccess, onError, disabled = false, cardFirstLayout = false }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { items, discountCode, sameDayHitService, saturdayDelivery } = useCartStore();
  const [config, setConfig] = React.useState<any>(null);
  const [loadingConfig, setLoadingConfig] = React.useState(true);
  const [expanded, setExpanded] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerForm>({ ...initialForm, email: user?.email || '' });
  const orderIdRef = useRef<string | null>(null);
  const checkoutKeyRef = useRef<string>(crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`);

  React.useEffect(() => {
    let active = true;
    fetch('/.netlify/functions/paypal-config')
      .then(async (response) => ({ response, payload: await response.json().catch(() => ({})) }))
      .then(({ response, payload }) => {
        if (!active) return;
        if (!response.ok || !payload?.enabled || !payload?.clientId || !payload?.clientToken) throw new Error(payload?.error || 'Secure checkout unavailable');
        setConfig(payload);
      })
      .catch((cause) => {
        console.error('[PayPalCheckoutComplete] config failed', cause);
        if (active) setError('Secure checkout is temporarily unavailable. Please refresh and try again.');
      })
      .finally(() => active && setLoadingConfig(false));
    return () => { active = false; };
  }, []);

  const update = (key: keyof CustomerForm, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));

  const customerInfo = useMemo(() => {
    const billingName = `${form.firstName} ${form.lastName}`.trim();
    const shippingName = form.shippingSameAsBilling
      ? billingName
      : `${form.shippingFirstName} ${form.shippingLastName}`.trim();
    return {
      fullName: billingName,
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email.trim(),
      phone: form.phone.trim(),
      address1: form.address1.trim(),
      address2: form.address2.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      postalCode: form.postalCode.trim(),
      country: form.country,
      shipping: {
        fullName: shippingName,
        firstName: form.shippingSameAsBilling ? form.firstName : form.shippingFirstName,
        lastName: form.shippingSameAsBilling ? form.lastName : form.shippingLastName,
        address1: form.shippingSameAsBilling ? form.address1 : form.shippingAddress1,
        address2: form.shippingSameAsBilling ? form.address2 : form.shippingAddress2,
        city: form.shippingSameAsBilling ? form.city : form.shippingCity,
        state: form.shippingSameAsBilling ? form.state : form.shippingState,
        postalCode: form.shippingSameAsBilling ? form.postalCode : form.shippingPostalCode,
        country: form.shippingSameAsBilling ? form.country : form.shippingCountry,
      },
    };
  }, [form]);

  const validate = () => {
    const required = [form.firstName, form.lastName, form.email, form.phone, form.address1, form.city, form.state, form.postalCode, form.country];
    const shippingRequired = form.shippingSameAsBilling ? [] : [form.shippingFirstName, form.shippingLastName, form.shippingAddress1, form.shippingCity, form.shippingState, form.shippingPostalCode, form.shippingCountry];
    if ([...required, ...shippingRequired].some((value) => !String(value || '').trim())) {
      setError('Please complete all required contact, billing, and shipping fields.');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError('Please enter a valid email address.');
      return false;
    }
    setError(null);
    return true;
  };

  const createOrder = async () => {
    if (!validate()) throw new Error('CUSTOMER_INFO_REQUIRED');
    setProcessing(true);
    try {
      if (!orderIdRef.current) {
        const pendingResponse = await fetch('/.netlify/functions/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user?.id || null,
            email: customerInfo.email,
            customer_name: customerInfo.fullName,
            customer_first_name: customerInfo.firstName,
            customer_phone: customerInfo.phone,
            shipping_name: customerInfo.shipping.fullName,
            shipping_street: customerInfo.shipping.address1,
            shipping_street2: customerInfo.shipping.address2,
            shipping_city: customerInfo.shipping.city,
            shipping_state: customerInfo.shipping.state,
            shipping_zip: customerInfo.shipping.postalCode,
            shipping_country: customerInfo.shipping.country,
            subtotal_cents: total,
            tax_cents: 0,
            total_cents: total,
            currency: 'usd',
            payment_method: 'paypal',
            payment_status: 'pending',
            checkout_idempotency_key: checkoutKeyRef.current,
            items,
            discountCode,
            sameDayHitService: Boolean(sameDayHitService),
            saturdayDelivery: Boolean(saturdayDelivery),
            attribution: getStoredAttribution(),
          }),
        });
        const pending = await pendingResponse.json().catch(() => ({}));
        if (!pendingResponse.ok || !pending?.orderId) throw new Error(pending?.message || pending?.error || 'Could not save order');
        orderIdRef.current = pending.orderId;
      }

      const response = await fetch('/.netlify/functions/paypal-create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          internalOrderId: orderIdRef.current,
          totalCents: total,
          items,
          customerInfo,
          email: customerInfo.email,
          user_id: user?.id || null,
          discountCode,
          sameDayHitService: Boolean(sameDayHitService),
          saturdayDelivery: Boolean(saturdayDelivery),
          attribution: getStoredAttribution(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.paypalOrderId) throw new Error(payload?.message || payload?.error || 'Could not start PayPal checkout');
      return payload.paypalOrderId;
    } finally {
      setProcessing(false);
    }
  };

  const approve = async (data: any, actions: any) => {
    setProcessing(true);
    try {
      let approvedOrderData = null;
      try { approvedOrderData = await actions?.order?.get?.(); } catch { /* server GET is fallback */ }
      const response = await fetch('/.netlify/functions/paypal-capture-minimal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderID: data.orderID,
          internalOrderId: orderIdRef.current,
          customerInfo,
          approvedOrderData,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload?.paymentCaptured === true && payload?.captureStatus === 'COMPLETED' && payload?.captureID) {
        toast({ title: 'Payment Successful!', description: 'Your order has been placed.' });
        onSuccess(payload.internalOrderId || orderIdRef.current || data.orderID, { ...payload, customerInfo, shippingAddress: customerInfo.shipping });
        return;
      }
      const message = payload?.message || (response.status === 422 ? 'Your card was declined. Please use a different card.' : 'Payment could not be completed.');
      setError(message);
      if (response.status !== 422) onError(new Error(message));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Payment could not be completed.';
      setError(message);
      onError(cause);
    } finally {
      setProcessing(false);
    }
  };

  const renderContactFields = () => (
    <div className="space-y-3 pb-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input className={fieldClass} placeholder="First name *" value={form.firstName} onChange={(e) => update('firstName', e.target.value)} />
        <Input className={fieldClass} placeholder="Last name *" value={form.lastName} onChange={(e) => update('lastName', e.target.value)} />
      </div>
      <Input className={fieldClass} type="email" placeholder="Email address *" value={form.email} onChange={(e) => update('email', e.target.value)} />
      <Input className={fieldClass} type="tel" placeholder="Phone number *" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
      <Input className={fieldClass} placeholder="Billing street address *" value={form.address1} onChange={(e) => update('address1', e.target.value)} />
      <Input className={fieldClass} placeholder="Apartment, suite, building (optional)" value={form.address2} onChange={(e) => update('address2', e.target.value)} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input className={fieldClass} placeholder="City *" value={form.city} onChange={(e) => update('city', e.target.value)} />
        <Input className={fieldClass} placeholder="State *" value={form.state} onChange={(e) => update('state', e.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input className={fieldClass} placeholder="ZIP code *" value={form.postalCode} onChange={(e) => update('postalCode', e.target.value)} />
        <select className="h-12 rounded-md border border-input bg-background px-3 text-sm" value={form.country} onChange={(e) => update('country', e.target.value)}>
          <option value="US">United States</option><option value="CA">Canada</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={form.shippingSameAsBilling} onChange={(e) => update('shippingSameAsBilling', e.target.checked)} />
        Shipping address is the same as billing
      </label>
      {!form.shippingSameAsBilling ? (
        <div className="space-y-3 rounded-md border border-gray-200 p-3">
          <p className="text-sm font-semibold">Shipping address</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input className={fieldClass} placeholder="First name *" value={form.shippingFirstName} onChange={(e) => update('shippingFirstName', e.target.value)} />
            <Input className={fieldClass} placeholder="Last name *" value={form.shippingLastName} onChange={(e) => update('shippingLastName', e.target.value)} />
          </div>
          <Input className={fieldClass} placeholder="Street address *" value={form.shippingAddress1} onChange={(e) => update('shippingAddress1', e.target.value)} />
          <Input className={fieldClass} placeholder="Apartment, suite, building (optional)" value={form.shippingAddress2} onChange={(e) => update('shippingAddress2', e.target.value)} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input className={fieldClass} placeholder="City *" value={form.shippingCity} onChange={(e) => update('shippingCity', e.target.value)} />
            <Input className={fieldClass} placeholder="State *" value={form.shippingState} onChange={(e) => update('shippingState', e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input className={fieldClass} placeholder="ZIP code *" value={form.shippingPostalCode} onChange={(e) => update('shippingPostalCode', e.target.value)} />
            <select className="h-12 rounded-md border border-input bg-background px-3 text-sm" value={form.shippingCountry} onChange={(e) => update('shippingCountry', e.target.value)}>
              <option value="US">United States</option><option value="CA">Canada</option>
            </select>
          </div>
        </div>
      ) : null}
    </div>
  );

  if (loadingConfig) return <div className="flex items-center justify-center py-8"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading secure checkout…</div>;
  if (!config) return <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error || 'Secure checkout is unavailable.'}</div>;

  const options: any = { clientId: config.clientId, currency: 'USD', intent: 'capture', commit: true, vault: false, components: 'buttons,card-fields', dataClientToken: config.clientToken, disableFunding: 'paylater,credit' };
  const blocked = disabled || processing;

  const card = (
    <div className="space-y-2.5">
      <Button type="button" variant="outline" size="lg" className="w-full border-gray-900 bg-gray-900 text-white hover:bg-gray-800 hover:text-white" onClick={() => { setExpanded((value) => !value); setError(null); }} disabled={blocked}>
        Pay with Debit or Credit Card
      </Button>
      {expanded ? (
        <div className="rounded-lg border border-gray-200 p-4">
          {renderContactFields()}
          <PayPalCardFieldsProvider createOrder={createOrder} onApprove={(data) => approve(data, null)} onError={(cause) => { setError('Payment could not be completed.'); onError(cause); }}>
            <PayPalCardFieldsForm />
            <InlineSubmit disabled={blocked} validate={validate} />
          </PayPalCardFieldsProvider>
        </div>
      ) : null}
    </div>
  );

  const paypal = <PayPalButtons fundingSource="paypal" style={{ layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal', height: 42 }} disabled={blocked} createOrder={createOrder} onApprove={approve} onError={onError} />;

  return (
    <div className="space-y-4">
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
      {processing ? <div className="flex items-center rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Completing payment…</div> : null}
      <PayPalScriptProvider options={options}>
        <p className="mb-3 text-xs text-gray-600">Pay securely by card or PayPal. No PayPal account required.</p>
        {cardFirstLayout ? <div className="space-y-3">{card}<div className="text-center text-xs text-gray-500">or</div>{paypal}</div> : <div className="space-y-3">{paypal}{card}</div>}
      </PayPalScriptProvider>
    </div>
  );
};

export default PayPalCheckoutComplete;
