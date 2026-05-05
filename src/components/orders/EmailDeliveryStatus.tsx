import React, { useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import type { Order } from '@/lib/orders/types';

// Statuses that indicate the customer did NOT receive the email.
// 'error'      -> Resend rejected the request (e.g. suppressed recipient)
// 'bounced'    -> Hard bounce reported by recipient mail server
// 'complained' -> Recipient marked the message as spam
const FAILURE_STATUSES = new Set(['error', 'bounced', 'complained']);

export type EmailKind = 'confirmation' | 'in_production' | 'shipped';

interface EmailRow {
  kind: EmailKind;
  label: string;
  status?: string | null;
  endpoint: string;
  // Whether this row is a candidate for showing a "Retry" button. Only
  // applicable when the status is a failure.
  retryBody?: Record<string, unknown>;
}

interface EmailDeliveryStatusProps {
  order: Order;
  onUpdated?: (next: Partial<Order>) => void;
}

function isFailure(status?: string | null): boolean {
  return !!status && FAILURE_STATUSES.has(status);
}

const STATUS_LABEL: Record<string, string> = {
  error: 'send failed',
  bounced: 'bounced',
  complained: 'marked as spam',
};

/**
 * Admin-only banner shown on an order when one or more transactional
 * emails (order confirmation, in-production notification, shipped
 * notification) failed to deliver via Resend (suppressed recipient,
 * bounce, or spam complaint).
 *
 * Per the UX spec: render a visible warning ("Email delivery failed –
 * customer did NOT receive notifications") and a per-email retry button
 * that re-attempts delivery once the upstream suppression has been
 * cleared.
 *
 * Future-ready: the banner also surfaces a placeholder for an
 * alternative contact channel (SMS / manual phone) so admins can route
 * the customer through a fallback while the email channel is unavailable.
 */
const EmailDeliveryStatus: React.FC<EmailDeliveryStatusProps> = ({ order, onUpdated }) => {
  const { toast } = useToast();
  const [retryingKind, setRetryingKind] = useState<EmailKind | null>(null);

  const rows: EmailRow[] = [
    {
      kind: 'confirmation',
      label: 'Order confirmation',
      status: order.confirmation_email_status,
      endpoint: '/.netlify/functions/admin-resend-confirmation',
      retryBody: { orderId: order.id },
    },
    {
      kind: 'in_production',
      label: 'In-production notification',
      status: order.production_email_status,
      endpoint: '/.netlify/functions/mark-in-production',
      // mark-in-production only re-sends when retryEmail=true and the
      // current status is a failure (server-side guard).
      retryBody: { orderId: order.id, retryEmail: true },
    },
    {
      kind: 'shipped',
      label: 'Shipping notification',
      status: order.shipping_notification_status,
      endpoint: '/.netlify/functions/send-shipping-notification',
      retryBody: { orderId: order.id },
    },
  ];

  const failed = rows.filter((r) => isFailure(r.status));
  if (failed.length === 0) return null;

  const handleRetry = async (row: EmailRow) => {
    setRetryingKind(row.kind);
    try {
      const response = await fetch(row.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(row.retryBody ?? { orderId: order.id }),
      });
      // Read once as text so we can fall back gracefully when the server
      // returns an HTML error page (e.g. 502/504 from Netlify) instead of
      // JSON. This preserves the actual server error in the toast.
      const rawBody = await response.text();
      let result: { ok?: boolean; error?: string } = {};
      try {
        result = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        result = { error: rawBody?.slice(0, 200) || undefined };
      }
      if (!response.ok || result.ok === false) {
        throw new Error(result.error || `Retry failed (HTTP ${response.status})`);
      }

      toast({
        title: 'Email resent',
        description: `${row.label} email was re-sent to the customer.`,
      });

      // Optimistically clear the failure on the local order so the warning
      // banner reflects the resend without requiring a full refetch.
      const patch: Partial<Order> = {};
      if (row.kind === 'confirmation') patch.confirmation_email_status = 'sent';
      if (row.kind === 'in_production') patch.production_email_status = 'sent';
      if (row.kind === 'shipped') patch.shipping_notification_status = 'sent';
      onUpdated?.(patch);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast({
        title: 'Retry failed',
        description: `Could not resend ${row.label.toLowerCase()} email: ${message}. Verify the recipient is no longer suppressed in Resend, then try again.`,
        variant: 'destructive',
      });
    } finally {
      setRetryingKind(null);
    }
  };

  return (
    <div
      role="alert"
      className="bg-red-50 border border-red-300 rounded-lg p-4"
      data-testid="email-delivery-failure-banner"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-red-800">
            Email delivery failed – customer did NOT receive notifications
          </h3>
          <p className="mt-1 text-xs text-red-700">
            Resend reported a problem delivering one or more emails for this order. Once the
            recipient is no longer suppressed in Resend, click <span className="font-semibold">Retry</span>{' '}
            to re-send.
          </p>

          <ul className="mt-3 space-y-2">
            {failed.map((row) => (
              <li
                key={row.kind}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white/70 border border-red-200 px-3 py-2"
              >
                <div className="text-xs text-red-800">
                  <span className="font-medium">{row.label}</span>
                  <span className="ml-2 text-red-700">
                    ({STATUS_LABEL[row.status || ''] || row.status})
                  </span>
                  {order.email && (
                    <span className="block text-[11px] text-red-600 break-all">to {order.email}</span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-red-400 text-red-700 hover:bg-red-100"
                  onClick={() => handleRetry(row)}
                  disabled={retryingKind === row.kind}
                >
                  {retryingKind === row.kind ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Retrying…
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Retry
                    </>
                  )}
                </Button>
              </li>
            ))}
          </ul>

          {/* Future-ready fallback notification placeholder. We intentionally
              do NOT wire this to a real SMS provider yet – it just surfaces
              the alternative contact path so admins can act manually while
              the email channel is unavailable. */}
          <div className="mt-3 flex items-start gap-2 text-[11px] text-red-700">
            <Phone className="h-3 w-3 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <span>
              Fallback contact: reach out manually
              {order.customer_phone ? (
                <> at <span className="font-mono">{order.customer_phone}</span></>
              ) : null}
              {order.email ? (
                <> or via <span className="font-mono break-all">{order.email}</span></>
              ) : null}
              . SMS fallback is not yet enabled.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailDeliveryStatus;
