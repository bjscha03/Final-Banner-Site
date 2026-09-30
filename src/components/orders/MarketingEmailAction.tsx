import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Mail, ShieldOff } from 'lucide-react';
import type { Order } from '@/lib/orders/types';
import { adminFetch } from '@/lib/serverAuth';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

type MarketingStatusName = 'loading' | 'unsent' | 'sending' | 'sent' | 'failed' | 'unsubscribed' | 'no_email' | 'test_order';

type MarketingStatus = {
  campaignKey?: string;
  status: MarketingStatusName;
  recipientEmail?: string | null;
  sentAt?: string | null;
  errorMessage?: string | null;
};

type StatusResolver = {
  resolve: (status: MarketingStatus) => void;
  reject: (error: unknown) => void;
};

const pendingStatusRequests = new Map<string, StatusResolver[]>();
let statusFlushTimer: ReturnType<typeof setTimeout> | null = null;

const fallbackStatus = (orderId: string): MarketingStatus => ({
  status: 'unsent',
  errorMessage: `Status could not be loaded for ${orderId.slice(-8)}. Duplicate protection will still run before send.`,
});

const flushStatusRequests = async () => {
  statusFlushTimer = null;
  const batch = new Map(pendingStatusRequests);
  pendingStatusRequests.clear();
  const orderIds = [...batch.keys()];
  if (!orderIds.length) return;

  try {
    const response = await adminFetch('/.netlify/functions/past-customer-marketing-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderIds }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.ok) throw new Error(result?.error || 'Marketing status request failed.');

    orderIds.forEach((orderId) => {
      const status = result.statuses?.[orderId] as MarketingStatus | undefined;
      const resolved = status || fallbackStatus(orderId);
      (batch.get(orderId) || []).forEach(({ resolve }) => resolve(resolved));
    });
  } catch (error) {
    orderIds.forEach((orderId) => {
      (batch.get(orderId) || []).forEach(({ resolve }) => resolve(fallbackStatus(orderId)));
    });
  }
};

const requestMarketingStatus = (orderId: string): Promise<MarketingStatus> => new Promise((resolve, reject) => {
  const current = pendingStatusRequests.get(orderId) || [];
  current.push({ resolve, reject });
  pendingStatusRequests.set(orderId, current);
  if (!statusFlushTimer) statusFlushTimer = setTimeout(() => void flushStatusRequests(), 0);
});

const normalizeEmail = (value?: string | null) => String(value || '').trim().toLowerCase();

const formatSentAt = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

type MarketingEmailActionProps = {
  order: Order;
  fullWidth?: boolean;
};

const MarketingEmailAction: React.FC<MarketingEmailActionProps> = ({ order, fullWidth = false }) => {
  const { toast } = useToast();
  const [status, setStatus] = useState<MarketingStatus>({ status: 'loading', recipientEmail: order.email || null });
  const sendingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setStatus({ status: 'loading', recipientEmail: order.email || null });
    void requestMarketingStatus(order.id).then((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => { cancelled = true; };
  }, [order.id, order.email]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ email?: string; status?: MarketingStatusName; sentAt?: string | null }>).detail;
      if (!detail?.email) return;
      const ownEmail = normalizeEmail(status.recipientEmail || order.email);
      if (!ownEmail || ownEmail !== normalizeEmail(detail.email)) return;
      setStatus((current) => ({
        ...current,
        status: detail.status || 'sent',
        recipientEmail: detail.email || current.recipientEmail,
        sentAt: detail.sentAt || current.sentAt,
        errorMessage: null,
      }));
    };
    window.addEventListener('bof-past-customer-marketing-updated', handler as EventListener);
    return () => window.removeEventListener('bof-past-customer-marketing-updated', handler as EventListener);
  }, [order.email, status.recipientEmail]);

  const handleSend = async () => {
    if (sendingRef.current || ['loading', 'sending', 'sent', 'unsubscribed', 'no_email', 'test_order'].includes(status.status)) return;
    sendingRef.current = true;
    setStatus((current) => ({ ...current, status: 'sending', errorMessage: null }));

    try {
      const response = await adminFetch('/.netlify/functions/send-past-customer-marketing-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id }),
      });
      const result = await response.json().catch(() => ({}));

      if (response.status === 409 && result?.code === 'MARKETING_UNSUBSCRIBED') {
        const email = result.customerEmail || status.recipientEmail || order.email || null;
        setStatus({ status: 'unsubscribed', recipientEmail: email });
        if (email) {
          window.dispatchEvent(new CustomEvent('bof-past-customer-marketing-updated', {
            detail: { email, status: 'unsubscribed' },
          }));
        }
        toast({
          title: 'Customer is unsubscribed',
          description: 'No marketing email was sent.',
        });
        return;
      }

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || 'The marketing email could not be sent.');
      }

      const email = result.customerEmail || status.recipientEmail || order.email || null;
      const nextStatus: MarketingStatus = {
        campaignKey: result.campaignKey,
        status: 'sent',
        recipientEmail: email,
        sentAt: result.sentAt || null,
      };
      setStatus(nextStatus);
      if (email) {
        window.dispatchEvent(new CustomEvent('bof-past-customer-marketing-updated', {
          detail: { email, status: 'sent', sentAt: result.sentAt || null },
        }));
      }
      toast({
        title: result.alreadySent ? 'Marketing email already sent' : 'Marketing email sent',
        description: result.alreadySent
          ? `${email || 'This customer'} already received this campaign. No duplicate was sent.`
          : `Sent to ${email || 'the customer'}.`,
      });
    } catch (error) {
      setStatus((current) => ({
        ...current,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'The marketing email could not be sent.',
      }));
      toast({
        title: 'Unable to send marketing email',
        description: error instanceof Error ? error.message : 'The marketing email could not be sent. Please try again.',
        variant: 'destructive',
      });
    } finally {
      sendingRef.current = false;
    }
  };

  const sentLabel = useMemo(() => formatSentAt(status.sentAt), [status.sentAt]);
  const disabled = ['loading', 'sending', 'sent', 'unsubscribed', 'no_email', 'test_order'].includes(status.status);

  const buttonLabel = (() => {
    if (status.status === 'loading') return 'Checking Marketing Status…';
    if (status.status === 'sending') return 'Sending…';
    if (status.status === 'sent') return 'Marketing Email Sent ✓';
    if (status.status === 'unsubscribed') return 'Unsubscribed';
    if (status.status === 'no_email') return 'No Email';
    if (status.status === 'test_order') return 'Test Order — No Marketing';
    if (status.status === 'failed') return 'Retry Marketing Email';
    return 'Send Marketing Email';
  })();

  const statusText = (() => {
    if (status.status === 'sent') return sentLabel ? `Sent ${sentLabel}` : 'This customer already received this campaign.';
    if (status.status === 'unsubscribed') return 'Marketing suppressed — no email will be sent.';
    if (status.status === 'no_email') return 'No valid customer email is attached to this order.';
    if (status.status === 'test_order') return 'Marketing email is disabled for test orders.';
    if (status.status === 'failed') return status.errorMessage || 'Previous attempt failed. Safe to retry.';
    if (status.status === 'loading') return 'Checking this customer against campaign history…';
    if (status.errorMessage) return status.errorMessage;
    return 'One-time past-customer campaign · duplicates blocked by email';
  })();

  return (
    <div className={cn(
      'rounded-md border border-orange-200 bg-orange-50/70 p-2',
      fullWidth ? 'w-full' : 'min-w-[220px]',
    )}>
      <Button
        type="button"
        size="sm"
        onClick={() => void handleSend()}
        disabled={disabled}
        aria-describedby={`marketing-email-status-${order.id}`}
        className={cn(
          status.status === 'sent'
            ? 'bg-emerald-700 text-white disabled:bg-emerald-700 disabled:text-white'
            : status.status === 'unsubscribed'
              ? 'bg-slate-500 text-white disabled:bg-slate-500 disabled:text-white'
              : 'bg-[#ff6a00] text-white hover:bg-[#e85f00] focus-visible:ring-2 focus-visible:ring-[#ff6a00] focus-visible:ring-offset-2 disabled:bg-orange-300 disabled:text-white',
          fullWidth ? 'w-full' : 'h-8 text-xs',
        )}
      >
        {status.status === 'loading' || status.status === 'sending' ? (
          <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />{buttonLabel}</>
        ) : status.status === 'sent' ? (
          <><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />{buttonLabel}</>
        ) : status.status === 'unsubscribed' ? (
          <><ShieldOff className="mr-1.5 h-3.5 w-3.5" />{buttonLabel}</>
        ) : (
          <><Mail className="mr-1.5 h-3.5 w-3.5" />{buttonLabel}</>
        )}
      </Button>
      <p id={`marketing-email-status-${order.id}`} className="mt-1.5 text-xs leading-5 text-slate-700">
        {statusText}
      </p>
    </div>
  );
};

export default MarketingEmailAction;
