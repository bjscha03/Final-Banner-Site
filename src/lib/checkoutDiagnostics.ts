import { gtag } from '@/lib/analytics';
import { sendClarity } from '@/lib/trackingRuntime';
import { recordIssueAction, reportSiteIssue } from '@/lib/siteIssueReporter';

type CheckoutDiagnostic =
  | 'payment_fields_ready' | 'payment_fields_load_failed'
  | 'pay_clicked' | 'validation_blocked' | 'provider_error'
  | 'payment_verifying' | 'payment_succeeded' | 'wallet_cancelled';

type DiagnosticContext = {
  provider: 'stripe' | 'paypal';
  method?: string;
  stage?: string;
  field?: string;
  code?: string;
};

/** Never send field values, provider messages, artwork, payment IDs or secrets. */
export function trackCheckoutDiagnostic(event: CheckoutDiagnostic, context: DiagnosticContext): void {
  recordIssueAction(`checkout_${event}`);
  const properties: Record<string, string> = {};
  for (const key of ['provider', 'method', 'stage', 'field', 'code'] as const) {
    const value = context[key];
    if (typeof value === 'string' && /^[a-zA-Z0-9_]{1,64}$/.test(value)) properties[key] = value;
  }
  // Ordinary declines and validation mistakes are not site outages.
  if (event === 'payment_fields_load_failed') reportSiteIssue('checkout_load_error', properties);
  if (event === 'provider_error' && !['card_declined', 'insufficient_funds', 'incorrect_cvc', 'expired_card', 'payment_intent_authentication_failure', 'INSTRUMENT_DECLINED', 'PAYER_ACTION_REQUIRED'].includes(properties.code)) {
    reportSiteIssue('checkout_error', properties);
  }
  // Use the existing tracking policy: preview and admin visits stay excluded.
  // Each destination is independent and cannot interfere with checkout.
  try { gtag('event', `checkout_${event}`, properties); } catch { /* best effort */ }
  try {
    sendClarity('event', `checkout_${event}`);
    if (properties.provider) sendClarity('set', 'checkout_provider', properties.provider);
    if (event === 'validation_blocked' && properties.field) {
      sendClarity('event', `checkout_validation_${properties.field}`);
    }
    if (event === 'provider_error' && properties.code) {
      sendClarity('set', 'checkout_error_code', properties.code);
    }
  } catch { /* best effort */ }
}
