import React, { useRef, useState } from 'react';
import { Ban, Loader2 } from 'lucide-react';
import type { Order } from '@/lib/orders/types';
import { adminFetch } from '@/lib/serverAuth';
import { usd } from '@/lib/pricing';
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

type AdminRefundOrderActionProps = {
  order: Order;
  onRefunded: (updatedOrder: Order) => void;
  fullWidth?: boolean;
};

const REFUNDABLE_STATUSES = new Set(['paid', 'in_production', 'shipped']);

const AdminRefundOrderAction: React.FC<AdminRefundOrderActionProps> = ({
  order,
  onRefunded,
  fullWidth = false,
}) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const status = String(order.status || '').trim().toLowerCase();

  if (!REFUNDABLE_STATUSES.has(status)) return null;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!saving) setOpen(nextOpen);
  };

  const handleRefund = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);

    try {
      const response = await adminFetch('/.netlify/functions/admin-refund-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.ok || result.order?.status !== 'refunded') {
        throw new Error(result.error || 'The order could not be marked as cancelled/refunded.');
      }

      onRefunded({ ...order, ...result.order, status: 'refunded' });
      setOpen(false);
      toast({
        title: 'Order marked cancelled / refunded',
        description: `Order #${order.id.slice(-8).toUpperCase()} is now excluded from active workflow and revenue statistics.`,
      });
    } catch (error) {
      toast({
        title: 'Unable to update order',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={saving}
        className={cn(
          'h-9 border-red-300 text-xs font-semibold text-red-700 hover:bg-red-50 hover:text-red-800',
          fullWidth && 'w-full',
        )}
      >
        {saving ? (
          <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Updating…</>
        ) : (
          <><Ban className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Mark Cancelled / Refunded</>
        )}
      </Button>

      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Mark this order cancelled / refunded?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left">
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900">
                  <div className="font-semibold">Order #{order.id.slice(-8).toUpperCase()}</div>
                  <div>{order.customer_name || order.shipping_name || order.email || 'Customer'}</div>
                  <div className="font-semibold">{usd(Number(order.total_cents || 0) / 100)}</div>
                </div>
                <p>
                  The order will be removed from pending, production, shipped, and revenue statistics and added to the refunded count.
                </p>
                <p className="font-semibold text-red-700">
                  This updates the Banners on the Fly record only. It does not send money through Apple Pay, Stripe, or PayPal.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Keep Order Active</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleRefund();
              }}
              disabled={saving}
              className="bg-red-700 text-white hover:bg-red-800 focus-visible:ring-red-700"
            >
              {saving ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating…</>
              ) : (
                <><Ban className="mr-2 h-4 w-4" aria-hidden="true" />Confirm Cancelled / Refunded</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default AdminRefundOrderAction;
