import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Star } from 'lucide-react';
import type { Order } from '@/lib/orders/types';
import { adminFetch } from '@/lib/serverAuth';
import {
  formatReviewRequestSentAt,
  getReviewRequestEligibility,
} from '@/lib/review-request';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import MarketingEmailAction from '@/components/orders/MarketingEmailAction';

type ReviewRequestUpdate = {
  sentAt: string;
  customerEmail: string;
};

type ReviewRequestActionProps = {
  order: Order;
  onSent: (orderId: string, update: ReviewRequestUpdate) => void;
  fullWidth?: boolean;
};

const ReviewRequestAction: React.FC<ReviewRequestActionProps> = ({ order, onSent, fullWidth = false }) => {
  const { toast } = useToast();
  const eligibility = getReviewRequestEligibility(order);
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastSentAt, setLastSentAt] = useState(order.review_request_last_sent_at || null);
  const [customerEmail, setCustomerEmail] = useState(eligibility.customerEmail);
  const sendingRef = useRef(false);

  useEffect(() => {
    setLastSentAt(order.review_request_last_sent_at || null);
  }, [order.review_request_last_sent_at]);

  useEffect(() => {
    setCustomerEmail(eligibility.customerEmail);
  }, [eligibility.customerEmail]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!sending) setOpen(nextOpen);
  };

  const handleSend = async () => {
    if (sendingRef.current || !eligibility.eligible) return;
    sendingRef.current = true;
    setSending(true);

    try {
      const response = await adminFetch('/.netlify/functions/send-review-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          confirmedPreviousSentAt: lastSentAt,
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (response.status === 409 && result.code === 'REVIEW_REQUEST_ALREADY_SENT' && result.lastSentAt) {
        const refreshedEmail = typeof result.customerEmail === 'string' ? result.customerEmail : customerEmail;
        setLastSentAt(result.lastSentAt);
        setCustomerEmail(refreshedEmail);
        onSent(order.id, { sentAt: result.lastSentAt, customerEmail: refreshedEmail });
        toast({
          title: 'Previous review request found',
          description: 'Please review the updated date and confirm again if you intend to resend it.',
        });
        return;
      }

      if (!response.ok || !result.ok || !result.sentAt) {
        throw new Error(result.error || 'The review email could not be sent.');
      }

      const sentEmail = typeof result.customerEmail === 'string' ? result.customerEmail : customerEmail;
      setLastSentAt(result.sentAt);
      setCustomerEmail(sentEmail);
      onSent(order.id, { sentAt: result.sentAt, customerEmail: sentEmail });
      setOpen(false);
      toast({
        title: 'Review request sent',
        description: `The review request was sent to ${sentEmail}.`,
      });
    } catch (error) {
      toast({
        title: 'Unable to send review request',
        description: error instanceof Error ? error.message : 'The review email could not be sent. Please try again.',
        variant: 'destructive',
      });
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const formattedLastSentAt = formatReviewRequestSentAt(lastSentAt);
  const disabledReason = eligibility.eligible ? '' : eligibility.reason;

  return (
    <div className={cn('space-y-2', fullWidth ? 'w-full' : 'min-w-[220px]')}>
      <div className="rounded-md border border-indigo-200 bg-indigo-50/70 p-2">
        <Button
          type="button"
          size="sm"
          onClick={() => setOpen(true)}
          disabled={!eligibility.eligible || sending}
          aria-describedby={`review-request-status-${order.id}`}
          className={cn(
            'bg-indigo-700 text-white hover:bg-indigo-800 focus-visible:ring-2 focus-visible:ring-indigo-700 focus-visible:ring-offset-2 disabled:bg-indigo-300 disabled:text-white',
            fullWidth ? 'w-full' : 'h-8 text-xs',
          )}
        >
          {sending ? (
            <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Sending…</>
          ) : (
            <><Star className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Send Review Email</>
          )}
        </Button>

        <div id={`review-request-status-${order.id}`} className="mt-1.5 text-xs leading-5">
          {formattedLastSentAt ? (
            <p className="font-medium text-indigo-900">Review request sent {formattedLastSentAt}</p>
          ) : disabledReason ? (
            <p className="text-slate-700">{disabledReason}</p>
          ) : (
            <p className="text-indigo-800">Manual customer follow-up</p>
          )}
        </div>

        <AlertDialog open={open} onOpenChange={handleOpenChange}>
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {lastSentAt ? 'Send another review request?' : 'Send review request?'}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-left">
                  {lastSentAt ? (
                    <p>
                      A review request was already sent to this customer on{' '}
                      <strong className="text-slate-900">{formattedLastSentAt}</strong>. Send another request?
                    </p>
                  ) : (
                    <p>This will email the review request to:</p>
                  )}
                  <p className="break-all rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-medium text-slate-900">
                    {customerEmail}
                  </p>
                  <p>No email will be sent until you confirm.</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  void handleSend();
                }}
                disabled={sending}
                className="bg-indigo-700 text-white hover:bg-indigo-800 focus-visible:ring-indigo-700"
              >
                {sending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</>
                ) : (
                  <><Star className="mr-2 h-4 w-4" aria-hidden="true" />Send Review Email</>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <MarketingEmailAction order={order} fullWidth={fullWidth} />
    </div>
  );
};

export default ReviewRequestAction;
