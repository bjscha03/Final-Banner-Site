import React, { useEffect, useRef, useState } from 'react';
import { Gift, Loader2, Mail, Star } from 'lucide-react';
import type { Order } from '@/lib/orders/types';
import { adminFetch } from '@/lib/serverAuth';
import { formatReviewRequestSentAt, getReviewRequestEligibility } from '@/lib/review-request';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

type ReviewAction = 'initial' | 'followup' | 'coupon';
export type ReviewRequestUpdate = {
  sentAt: string;
  customerEmail: string;
  action?: ReviewAction;
  offerPercentage?: number;
  followupSentAt?: string | null;
  couponCode?: string | null;
  couponSentAt?: string | null;
};

type ReviewRequestActionProps = {
  order: Order;
  onSent: (orderId: string, update: ReviewRequestUpdate) => void;
  fullWidth?: boolean;
};

const sentButtonClasses = 'border border-slate-300 bg-slate-200 text-slate-600 disabled:opacity-100';

const ReviewRequestAction: React.FC<ReviewRequestActionProps> = ({ order, onSent, fullWidth = false }) => {
  const { toast } = useToast();
  const eligibility = getReviewRequestEligibility(order);
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<ReviewAction>('initial');
  const [sending, setSending] = useState(false);
  const [lastSentAt, setLastSentAt] = useState(order.review_request_last_sent_at || null);
  const [followupSentAt, setFollowupSentAt] = useState(order.review_followup_sent_at || null);
  const [couponCode, setCouponCode] = useState(order.review_coupon_code || null);
  const [couponSentAt, setCouponSentAt] = useState(order.review_coupon_sent_at || null);
  const [offer, setOffer] = useState(order.review_offer_percentage === 30 || order.review_followup_sent_at ? 30 : 25);
  const [customerEmail, setCustomerEmail] = useState(eligibility.customerEmail);
  const sendingRef = useRef(false);

  useEffect(() => {
    setLastSentAt(order.review_request_last_sent_at || null);
    setFollowupSentAt(order.review_followup_sent_at || null);
    setCouponCode(order.review_coupon_code || null);
    setCouponSentAt(order.review_coupon_sent_at || null);
    setOffer(order.review_offer_percentage === 30 || order.review_followup_sent_at ? 30 : 25);
  }, [order.review_request_last_sent_at, order.review_followup_sent_at, order.review_coupon_code, order.review_coupon_sent_at, order.review_offer_percentage]);
  useEffect(() => { setCustomerEmail(eligibility.customerEmail); }, [eligibility.customerEmail]);

  const initialSent = Boolean(lastSentAt || followupSentAt || couponCode || couponSentAt);
  const blocked = !eligibility.eligible || sending;
  const actionDisabled: Record<ReviewAction, boolean> = {
    initial: blocked || initialSent,
    followup: blocked || !lastSentAt || Boolean(followupSentAt || couponCode),
    coupon: blocked || !lastSentAt || Boolean(couponSentAt),
  };

  const applyUpdate = (update: ReviewRequestUpdate) => {
    setLastSentAt(update.sentAt);
    setCustomerEmail(update.customerEmail);
    if (update.offerPercentage !== undefined) setOffer(update.offerPercentage);
    if (update.followupSentAt !== undefined) setFollowupSentAt(update.followupSentAt);
    if (update.couponCode !== undefined) setCouponCode(update.couponCode);
    if (update.couponSentAt !== undefined) setCouponSentAt(update.couponSentAt);
    onSent(order.id, update);
  };
  const handleSend = async () => {
    if (sendingRef.current || actionDisabled[action]) return;
    sendingRef.current = true;
    setSending(true);
    try {
      const response = await adminFetch('/.netlify/functions/send-review-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, action, confirmedPreviousSentAt: lastSentAt, reviewVerified: action === 'coupon' }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 409 && result.code === 'REVIEW_REQUEST_ALREADY_SENT' && result.lastSentAt) {
        applyUpdate({ sentAt: result.lastSentAt, customerEmail: result.customerEmail || customerEmail,
          offerPercentage: result.offerPercentage, followupSentAt: result.followupSentAt });
        setOpen(false);
        toast({ title: 'Review history updated', description: 'The saved send history has been refreshed. Completed requests are marked as sent.' });
        return;
      }
      if (!response.ok || !result.ok || !result.sentAt) throw new Error(result.error || 'The email could not be sent.');
      applyUpdate({ ...result, customerEmail: result.customerEmail || customerEmail });
      setOpen(false);
      toast({
        title: result.alreadySent ? 'Already sent' : action === 'coupon' ? `${result.offerPercentage}% coupon sent` : action === 'followup' ? '30% follow-up sent' : 'Review request sent',
        description: result.alreadySent ? 'No duplicate email or coupon was created.' : `Sent to ${result.customerEmail || customerEmail}.`,
      });
    } catch (error) {
      toast({ title: 'Unable to complete email delivery', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
    } finally { sendingRef.current = false; setSending(false); }
  };
  const openAction = (next: ReviewAction) => {
    if (actionDisabled[next]) return;
    setAction(next);
    setOpen(true);
  };
  const formattedLastSentAt = formatReviewRequestSentAt(lastSentAt);
  const actionLabel = action === 'coupon' ? `Verify Review & Send ${offer}% Coupon` : action === 'followup' ? 'Send 30% Follow-Up' : 'Send Review Email';

  return (
    <div className={cn('rounded-md border border-indigo-200 bg-indigo-50/70 p-2', fullWidth ? 'w-full' : 'min-w-[220px]')}>
      <div className="flex flex-col gap-2">
        <Button type="button" size="sm" onClick={() => openAction('initial')} disabled={actionDisabled.initial}
          aria-describedby={`review-request-status-${order.id}`} className={cn('h-auto min-h-9 whitespace-normal px-2 py-2', initialSent ? sentButtonClasses : 'bg-indigo-700 text-white hover:bg-indigo-800')}>
          <Star className="mr-1.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{initialSent ? 'Review Email Sent' : 'Send Review Email'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => openAction('followup')}
          disabled={actionDisabled.followup} className={cn('h-auto min-h-9 whitespace-normal px-2 py-2', followupSentAt ? sentButtonClasses : 'border-indigo-300 text-indigo-900')}>
          <Mail className="mr-1.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{followupSentAt ? '30% Follow-Up Sent' : 'Send 30% Follow-Up'}
        </Button>
        <Button type="button" size="sm" onClick={() => openAction('coupon')}
          disabled={actionDisabled.coupon} className="h-auto min-h-9 whitespace-normal bg-emerald-700 px-2 py-2 text-white hover:bg-emerald-800">
          <Gift className="mr-1.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{couponSentAt ? `${offer}% Coupon Sent` : `Verify Review & Send ${offer}% Coupon`}
        </Button>
      </div>
      <div id={`review-request-status-${order.id}`} className="mt-2 space-y-1 text-xs leading-5" aria-live="polite">
        {formattedLastSentAt ? <p className="font-medium text-indigo-900">Review request sent {formattedLastSentAt}</p>
          : <p className="text-slate-700">{eligibility.eligible ? 'Initial offer: 25%. Send each email manually.' : eligibility.reason}</p>}
        {followupSentAt && <p className="text-indigo-900">30% follow-up: {formatReviewRequestSentAt(followupSentAt)}</p>}
        {couponCode && <p className="break-all font-medium text-emerald-900">{couponCode} · {order.review_coupon_used ? 'Used or reserved at checkout' : 'Single use'}</p>}
        {couponSentAt && <p className="text-emerald-900">Coupon emailed {formatReviewRequestSentAt(couponSentAt)}</p>}
        {!lastSentAt && eligibility.eligible && <p className="text-slate-600">Follow-up and coupon unlock after the first request.</p>}
      </div>
      <AlertDialog open={open} onOpenChange={(value) => { if (!sending) setOpen(value); }}>
        <AlertDialogContent className="max-h-[90dvh] max-w-md overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>{action === 'coupon' ? `Send the ${offer}% thank-you coupon?` : action === 'followup' ? 'Send a friendly 30% follow-up?' : 'Send review request?'}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left">
                <p className="break-all rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-medium text-slate-900">{customerEmail}</p>
                {action === 'coupon' ? <>
                  <p>By confirming, you verify that you have checked this customer’s Google review. No particular rating is required.</p>
                  <p>The system will email a personal, one-time-use <strong>{offer}% off</strong> code based on the last review offer sent. Retrying delivery keeps the same coupon.</p>
                </> : action === 'followup' ? <>
                  <p>A gentle reminder will thank them for their business, invite an honest Google review, and increase the offer from 25% to <strong>30% off their next order</strong> after manual verification.</p>
                  <p>Only send this if you have checked that they have not already left a review. This follow-up can be sent once.</p>
                </> : <>
                  <p>This request offers a 25% thank-you coupon after you manually verify their review.</p>
                </>}
                <p>No email will be sent until you confirm.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void handleSend(); }} disabled={actionDisabled[action]}
              className="h-auto min-h-10 whitespace-normal bg-indigo-700 py-2 text-white hover:bg-indigo-800">
              {sending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</> : actionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
export default ReviewRequestAction;
