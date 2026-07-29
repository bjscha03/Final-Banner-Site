import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Loader2, Mail, Phone, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import type { Order } from '@/lib/orders/types';
import { authorizedHeaders } from '@/lib/serverAuth';

const SUCCESS_STATUSES = new Set(['sent', 'delivered', 'opened', 'clicked']);
const FAILURE_STATUSES = new Set(['error', 'bounced', 'complained']);
const STALE_AFTER_MS = 2 * 60 * 1000;

export type EmailKind = 'order_emails' | 'in_production' | 'shipped';

interface EmailRow {
  kind: Exclude<EmailKind, 'order_emails'>;
  label: string;
  status?: string | null;
  endpoint: string;
  retryBody?: Record<string, unknown>;
}

interface EmailDeliveryStatusProps {
  order: Order;
  onUpdated?: (next: Partial<Order>) => void;
}

function normalizeStatus(status?: string | null): string {
  return String(status || '').trim().toLowerCase();
}

function isSuccess(status?: string | null): boolean {
  return SUCCESS_STATUSES.has(normalizeStatus(status));
}

function isFailure(status?: string | null): boolean {
  return FAILURE_STATUSES.has(normalizeStatus(status));
}

function getStatusLabel(status?: string | null): string {
  const normalized = normalizeStatus(status);
  if (!normalized) return 'Not confirmed';
  if (normalized === 'error') return 'Send failed';
  if (normalized === 'complained') return 'Marked as spam';
  return normalized.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function StatusPill({ status }: { status?: string | null }) {
  const normalized = normalizeStatus(status);
  if (isSuccess(normalized)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
        <CheckCircle2 className="h-3 w-3" />
        {getStatusLabel(normalized)}
      </span>
    );
  }

  if (isFailure(normalized)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
        <AlertTriangle className="h-3 w-3" />
        {getStatusLabel(normalized)}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
      <Clock className="h-3 w-3" />
      {getStatusLabel(normalized)}
    </span>
  );
}

async function readJsonResponse(response: Response): Promise<Record<string, any>> {
  const rawBody = await response.text();
  if (!rawBody) return {};
  try {
    return JSON.parse(rawBody);
  } catch {
    return { error: rawBody.slice(0, 300) };
  }
}

/**
 * Admin-only order email status and recovery panel.
 *
 * The original implementation only rendered for explicit Resend failures.
 * Orders whose notification function never started had null/pending statuses,
 * which hid the warning entirely. This panel treats missing initial-order email
 * statuses as actionable and provides one recovery action that re-sends both
 * the customer confirmation and the internal new-order notification.
 */
const EmailDeliveryStatus: React.FC<EmailDeliveryStatusProps> = ({ order, onUpdated }) => {
  const { toast } = useToast();
  const [retryingKind, setRetryingKind] = useState<EmailKind | null>(null);
  const [statusPatch, setStatusPatch] = useState<Partial<Order>>({});

  useEffect(() => {
    setStatusPatch({});
  }, [order.id]);

  const effectiveOrder = useMemo(
    () => ({ ...order, ...statusPatch }),
    [order, statusPatch],
  );

  const customerStatus = effectiveOrder.confirmation_email_status;
  const adminStatus = effectiveOrder.admin_notification_status;
  const customerSent = isSuccess(customerStatus);
  const adminSent = isSuccess(adminStatus);
  const initialOrderEmailsComplete = customerSent && adminSent;

  const orderAgeMs = useMemo(() => {
    const createdAt = new Date(order.created_at).getTime();
    if (!Number.isFinite(createdAt)) return STALE_AFTER_MS;
    return Math.max(0, Date.now() - createdAt);
  }, [order.created_at]);

  const explicitInitialFailure = isFailure(customerStatus) || isFailure(adminStatus);
  const initialEmailsStale = !initialOrderEmailsComplete && orderAgeMs >= STALE_AFTER_MS;
  const showDangerState = explicitInitialFailure || initialEmailsStale;

  const supplementalRows: EmailRow[] = [
    {
      kind: 'in_production',
      label: 'In-production notification',
      status: effectiveOrder.production_email_status,
      endpoint: '/.netlify/functions/mark-in-production',
      retryBody: { orderId: order.id, retryEmail: true },
    },
    {
      kind: 'shipped',
      label: 'Shipping notification',
      status: effectiveOrder.shipping_notification_status,
      endpoint: '/.netlify/functions/resend-tracking-email',
      retryBody: { orderId: order.id },
    },
  ].filter((row) => isFailure(row.status));

  if (initialOrderEmailsComplete && supplementalRows.length === 0) return null;

  const applyPatch = (patch: Partial<Order>) => {
    setStatusPatch((current) => ({ ...current, ...patch }));
    onUpdated?.(patch);
  };

  const handleResendBothOrderEmails = async () => {
    setRetryingKind('order_emails');
    try {
      const response = await fetch('/.netlify/functions/admin-resend-confirmation', {
        method: 'POST',
        headers: authorizedHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ orderId: order.id }),
      });
      const result = await readJsonResponse(response);
      const now = new Date().toISOString();
      const patch: Partial<Order> = {};

      if (result.customerEmailSent) {
        patch.confirmation_email_status = 'sent';
        patch.confirmation_emailed_at = now;
      }
      if (result.adminEmailSent) {
        patch.admin_notification_status = 'sent';
        patch.admin_notification_sent_at = now;
      }
      if (Object.keys(patch).length > 0) applyPatch(patch);

      if (
        !response.ok
        || result.ok === false
        || result.customerEmailSent !== true
        || result.adminEmailSent !== true
      ) {
        const providerErrors = Array.isArray(result.errors) ? result.errors.filter(Boolean).join(' ') : '';
        throw new Error(providerErrors || result.error || `Email resend failed (HTTP ${response.status})`);
      }

      toast({
        title: 'Both order emails sent',
        description: 'The customer confirmation and internal new-order notification were re-sent successfully.',
      });
      window.setTimeout(() => window.location.reload(), 350);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast({
        title: 'Order email resend failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setRetryingKind(null);
    }
  };

  const handleSupplementalRetry = async (row: EmailRow) => {
    setRetryingKind(row.kind);
    try {
      const response = await fetch(row.endpoint, {
        method: 'POST',
        headers: authorizedHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(row.retryBody ?? { orderId: order.id }),
      });
      const result = await readJsonResponse(response);
      if (!response.ok || result.ok === false) {
        throw new Error(result.error || `Retry failed (HTTP ${response.status})`);
      }

      const now = new Date().toISOString();
      const patch: Partial<Order> = {};
      if (row.kind === 'in_production') {
        patch.production_email_status = 'sent';
        patch.production_email_sent = true;
        patch.production_email_sent_at = now;
      }
      if (row.kind === 'shipped') {
        patch.shipping_notification_status = 'sent';
        patch.shipping_notification_sent = true;
        patch.shipping_notification_sent_at = now;
      }
      applyPatch(patch);

      toast({
        title: 'Email resent',
        description: `${row.label} email was re-sent to the customer.`,
      });
      window.setTimeout(() => window.location.reload(), 350);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast({
        title: 'Retry failed',
        description: `Could not resend ${row.label.toLowerCase()}: ${message}`,
        variant: 'destructive',
      });
    } finally {
      setRetryingKind(null);
    }
  };

  const panelClasses = showDangerState
    ? 'border-red-300 bg-red-50 text-red-800'
    : 'border-amber-300 bg-amber-50 text-amber-800';
  const iconClasses = showDangerState ? 'text-red-600' : 'text-amber-600';

  return (
    <div
      role="alert"
      className={`rounded-lg border p-4 ${panelClasses}`}
      data-testid="email-delivery-status-panel"
    >
      <div className="flex items-start gap-3">
        {showDangerState ? (
          <AlertTriangle className={`mt-0.5 h-5 w-5 flex-shrink-0 ${iconClasses}`} aria-hidden="true" />
        ) : (
          <Clock className={`mt-0.5 h-5 w-5 flex-shrink-0 ${iconClasses}`} aria-hidden="true" />
        )}

        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">
            {showDangerState ? 'Order emails were not confirmed' : 'Order emails are still processing'}
          </h3>
          <p className="mt-1 text-xs">
            {showDangerState
              ? 'The customer confirmation and/or the internal new-order notification did not complete. Re-send both emails now.'
              : 'This order is new and both email deliveries have not been confirmed yet.'}
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-md border border-current/15 bg-white/70 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium">Customer confirmation</span>
                <StatusPill status={customerStatus} />
              </div>
              {order.email && <div className="mt-1 break-all text-[11px] opacity-80">to {order.email}</div>}
            </div>
            <div className="rounded-md border border-current/15 bg-white/70 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium">Internal new-order alert</span>
                <StatusPill status={adminStatus} />
              </div>
              <div className="mt-1 text-[11px] opacity-80">to the configured admin email</div>
            </div>
          </div>

          {!initialOrderEmailsComplete && (
            <Button
              size="sm"
              variant="outline"
              className="mt-3 h-8 border-current/40 bg-white text-xs hover:bg-white/80"
              onClick={handleResendBothOrderEmails}
              disabled={retryingKind === 'order_emails'}
            >
              {retryingKind === 'order_emails' ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Resending both…
                </>
              ) : (
                <>
                  <Mail className="mr-1 h-3 w-3" />
                  Resend customer + admin emails
                </>
              )}
            </Button>
          )}

          {supplementalRows.length > 0 && (
            <ul className="mt-3 space-y-2">
              {supplementalRows.map((row) => (
                <li
                  key={row.kind}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-white/70 px-3 py-2"
                >
                  <div className="text-xs">
                    <span className="font-medium">{row.label}</span>
                    <span className="ml-2 opacity-80">({getStatusLabel(row.status)})</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 border-red-400 text-xs text-red-700 hover:bg-red-100"
                    onClick={() => handleSupplementalRetry(row)}
                    disabled={retryingKind === row.kind}
                  >
                    {retryingKind === row.kind ? (
                      <>
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        Retrying…
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-1 h-3 w-3" />
                        Retry
                      </>
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex items-start gap-2 text-[11px] opacity-80">
            <Phone className="mt-0.5 h-3 w-3 flex-shrink-0" aria-hidden="true" />
            <span>
              Fallback contact: reach out manually{order.customer_phone ? ` at ${order.customer_phone}` : ''}
              {order.email ? ` or via ${order.email}` : ''}.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailDeliveryStatus;
