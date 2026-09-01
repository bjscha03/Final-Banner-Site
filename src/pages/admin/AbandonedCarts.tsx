import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  FilterX,
  Image as ImageIcon,
  Loader2,
  Mail,
  Package,
  RefreshCw,
  Shield,
  ShoppingCart,
  Trash2,
  UserRound,
  UsersRound,
} from 'lucide-react';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { useAuth, isAdmin } from '@/lib/auth';
import { adminFetch } from '@/lib/serverAuth';
import { usd } from '@/lib/pricing';
import {
  EMPTY_ABANDONED_CART_FILTERS,
  isRecoveryEmailEligible,
  summarizeAbandonedCarts,
  type AbandonedCartAdminRecord,
  type AbandonedCartAnalytics,
  type AbandonedCartFilters,
  type AbandonedCartOutcomeBand,
  type AbandonedCartOutcomeComparison,
  type AbandonedCartSort,
  type AbandonedCartFacet,
} from '@/lib/abandoned-cart-admin';

const STAGE_OPTIONS = ['cart', 'checkout', 'contact', 'payment_started', 'unknown'];
const STATUS_OPTIONS = ['active', 'abandoned', 'recovered', 'expired'];
const CARTS_PER_PAGE = 25;

type CartPagination = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

const EMPTY_PAGINATION: CartPagination = {
  page: 1,
  pageSize: CARTS_PER_PAGE,
  totalItems: 0,
  totalPages: 1,
  hasPrevious: false,
  hasNext: false,
};

const humanize = (value: string): string => (
  value.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
);

const formatCents = (value: number | null): string => (
  value === null ? 'Not captured' : usd(value / 100)
);

const formatDate = (value: string | null): string => {
  if (!value) return 'Not captured';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not captured' : date.toLocaleString();
};

const getTimeSince = (value: string | null): string => {
  if (!value) return 'Not captured';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not captured';
  const elapsed = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(elapsed / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
};

const getThumbnailUrl = (imageUrl: string | null, maxWidth = 160): string | null => {
  if (!imageUrl || imageUrl.startsWith('data:')) return null;
  if (imageUrl.includes('res.cloudinary.com') && imageUrl.includes('/upload/')) {
    return imageUrl.replace('/upload/', `/upload/w_${maxWidth},c_limit,f_auto,q_auto/`);
  }
  if (!imageUrl.startsWith('http')) {
    return `https://res.cloudinary.com/dtrxl120u/image/upload/w_${maxWidth},c_limit,f_auto,q_auto/${imageUrl}`;
  }
  return `https://res.cloudinary.com/dtrxl120u/image/fetch/w_${maxWidth},c_limit,f_auto,q_auto/${encodeURIComponent(imageUrl)}`;
};

const statusBadge = (status: string) => {
  if (status === 'recovered') return <Badge className="bg-green-600 hover:bg-green-600">Recovered</Badge>;
  if (status === 'abandoned') return <Badge variant="destructive">Abandoned</Badge>;
  if (status === 'expired') return <Badge variant="outline">Expired</Badge>;
  return <Badge variant="secondary">Active</Badge>;
};

const recoveryIneligibility = (cart: AbandonedCartAdminRecord): string | null => {
  if (!cart.email) return 'No email captured';
  if (cart.recovery_status === 'active') return 'Customer is still active';
  if (cart.recovery_status === 'recovered') return 'Order completed';
  if (cart.recovery_status === 'expired') return 'Cart expired';
  if (cart.recovery_status !== 'abandoned') return 'Cart is not confirmed abandoned';
  if (cart.recovery_suppression_reason || cart.recovery_suppressed_at) {
    return `Suppressed: ${humanize(cart.recovery_suppression_reason || 'email suppression')}`;
  }
  return null;
};

const timeRemaining = (value: string | null): string => {
  if (!value) return 'No expiration recorded';
  const expiresAt = new Date(value).getTime();
  if (!Number.isFinite(expiresAt)) return 'Invalid expiration';
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return 'Expired';
  const minutes = Math.max(1, Math.ceil(remaining / 60_000));
  if (minutes < 60) return `Expires in ${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 48) return `Expires in ${hours}h`;
  return `Expires in ${Math.ceil(hours / 24)}d`;
};

const recoveryEventLabel = (event: AbandonedCartAdminRecord['recovery_events'][number]): string => {
  const sequence = event.email_sequence_number ? `Email ${event.email_sequence_number}` : 'Recovery email';
  switch (event.event_type) {
    case 'cart_created': return 'Cart captured';
    case 'email_captured': return 'Customer email captured';
    case 'cart_abandoned': return 'Cart marked abandoned';
    case 'cart_reactivated': return 'Customer returned to cart';
    case 'email_sent': return `${sequence} sent`;
    case 'email_delivered': return `${sequence} delivered`;
    case 'email_opened': return `${sequence} reported open`;
    case 'email_clicked': return event.source === 'signed_recovery_link'
      ? `${sequence} recovery link opened`
      : `${sequence} link clicked`;
    case 'recovery_link_clicked': return `${sequence} recovery link opened`;
    case 'email_bounced': return `${sequence} bounced`;
    case 'email_complained': return `${sequence} marked as spam`;
    case 'email_failed': return `${sequence} failed`;
    case 'email_suppressed': return `${sequence} suppressed`;
    case 'cart_recovered': return 'Order recovered';
    case 'coupon_issued': return 'Recovery offer issued';
    case 'coupon_used': return 'Recovery offer used';
    case 'coupon_expired': return 'Recovery offer expired';
    case 'discount_applied': return 'Recovery discount applied';
    default: return humanize(event.event_type);
  }
};

const RecoveryFunnel: React.FC<{ cart: AbandonedCartAdminRecord }> = ({ cart }) => {
  const deliveryBySequence = new Map(cart.recovery_deliveries.map((delivery) => [delivery.sequence_number, delivery]));
  const sentSequences = new Set(cart.recovery_events
    .filter((event) => ['email_sent', 'email_delivered'].includes(event.event_type))
    .map((event) => event.email_sequence_number)
    .filter((sequence): sequence is number => sequence !== null));
  const emailStep = (sequence: number) => {
    const delivery = deliveryBySequence.get(sequence);
    const sent = delivery?.status === 'sent' || sentSequences.has(sequence) || cart.recovery_emails_sent >= sequence;
    const stopped = delivery && ['failed', 'suppressed', 'skipped'].includes(delivery.status);
    return {
      label: `Email ${sequence}`,
      state: sent ? 'complete' : stopped ? 'warning' : 'pending',
      detail: sent ? 'Sent' : stopped ? humanize(delivery.status) : 'Pending',
    };
  };
  const clicked = cart.recovery_events.some((event) => ['email_clicked', 'recovery_link_clicked'].includes(event.event_type));
  const steps = [
    { label: 'Cart', state: 'complete', detail: 'Captured' },
    { label: 'Email', state: cart.email ? 'complete' : 'pending', detail: cart.email ? 'Captured' : 'Missing' },
    { label: 'Abandoned', state: cart.abandoned_at ? 'complete' : 'pending', detail: cart.abandoned_at ? 'Recorded' : 'Waiting' },
    emailStep(1),
    emailStep(2),
    emailStep(3),
    { label: 'Clicked', state: clicked ? 'complete' : 'pending', detail: clicked ? 'Recorded' : 'None' },
    { label: 'Recovered', state: cart.recovery_status === 'recovered' ? 'complete' : 'pending', detail: cart.recovery_status === 'recovered' ? 'Ordered' : 'Open' },
  ];

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Recovery funnel</div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {steps.map((step) => (
          <div
            key={step.label}
            className={`rounded-lg border px-2.5 py-2 ${
              step.state === 'complete'
                ? 'border-green-200 bg-green-50'
                : step.state === 'warning'
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-gray-200 bg-gray-50'
            }`}
          >
            <div className="text-[11px] font-semibold text-gray-900">{step.label}</div>
            <div className={`text-[11px] ${step.state === 'complete' ? 'text-green-700' : step.state === 'warning' ? 'text-amber-700' : 'text-gray-500'}`}>{step.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const RecoveryOfferList: React.FC<{ cart: AbandonedCartAdminRecord }> = ({ cart }) => {
  if (cart.recovery_offers.length === 0) return null;
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Recovery offers</div>
      <div className="mt-2 space-y-2">
        {cart.recovery_offers.map((offer, index) => (
          <div key={`${offer.code || 'offer'}-${index}`} className="rounded-lg border bg-gray-50 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <code className="break-all font-semibold text-[#18448D]">{offer.code || 'Code unavailable'}</code>
              <Badge variant={offer.status === 'active' ? 'default' : 'outline'}>{humanize(offer.status)}</Badge>
            </div>
            <div className="mt-1 text-xs text-gray-600">
              {offer.discount_percentage !== null
                ? `${offer.discount_percentage}% off`
                : offer.discount_amount_cents !== null
                  ? `${formatCents(offer.discount_amount_cents)} off`
                  : 'Discount amount unavailable'}
              {' · '}{offer.status === 'active' ? timeRemaining(offer.expires_at) : offer.status === 'used' ? `Used ${formatDate(offer.used_at)}` : `Expired ${formatDate(offer.expires_at)}`}
            </div>
            {offer.order_id && <div className="mt-1 break-all text-xs text-gray-500">Order {offer.order_id}</div>}
          </div>
        ))}
      </div>
    </div>
  );
};

type RecoveryTimelineEntry = { key: string; label: string; timestamp: string };

const recoveryTimeline = (cart: AbandonedCartAdminRecord): RecoveryTimelineEntry[] => {
  const entries: RecoveryTimelineEntry[] = [];
  if (cart.created_at) entries.push({ key: 'cart-captured', label: 'Cart captured', timestamp: cart.created_at });
  if (cart.abandoned_at) entries.push({ key: 'cart-abandoned', label: 'Cart marked abandoned', timestamp: cart.abandoned_at });
  cart.recovery_events.forEach((event, index) => {
    if (event.created_at) entries.push({ key: `event-${index}-${event.event_type}`, label: recoveryEventLabel(event), timestamp: event.created_at });
  });
  cart.recovery_offers.forEach((offer, index) => {
    if (offer.issued_at) {
      const offerLabel = offer.discount_percentage !== null
        ? `${offer.discount_percentage}% recovery offer issued`
        : 'Recovery offer issued';
      entries.push({ key: `offer-issued-${index}`, label: offerLabel, timestamp: offer.issued_at });
    }
    if (offer.used_at) entries.push({ key: `offer-used-${index}`, label: 'Recovery offer used', timestamp: offer.used_at });
    else if (offer.status === 'expired' && offer.expires_at) entries.push({ key: `offer-expired-${index}`, label: 'Recovery offer expired', timestamp: offer.expires_at });
  });
  if (cart.recovered_at) entries.push({ key: 'cart-recovered', label: 'Recovered order completed', timestamp: cart.recovered_at });
  return entries
    .filter((entry) => Number.isFinite(new Date(entry.timestamp).getTime()))
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
    .slice(0, 20);
};

const RecoveryTimeline: React.FC<{ cart: AbandonedCartAdminRecord }> = ({ cart }) => {
  const entries = recoveryTimeline(cart);
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Recovery activity</div>
      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">No recovery activity recorded.</p>
      ) : (
        <ol className="mt-2 space-y-2 border-l border-gray-200 pl-3">
          {entries.map((entry) => (
            <li key={entry.key} className="text-sm">
              <div className="font-medium text-gray-800">{entry.label}</div>
              <div className="text-xs text-gray-500">{formatDate(entry.timestamp)}</div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

const FacetList: React.FC<{ title: string; values: AbandonedCartFacet[] }> = ({ title, values }) => (
  <div className="rounded-lg border bg-white p-4">
    <div className="text-sm font-semibold text-gray-900">{title}</div>
    {values.length === 0 ? (
      <p className="mt-3 text-sm text-gray-500">No matching data</p>
    ) : (
      <div className="mt-3 space-y-2">
        {values.map((value) => (
          <div key={value.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-gray-700">{humanize(value.label)}</span>
            <Badge variant="secondary">{value.count}</Badge>
          </div>
        ))}
      </div>
    )}
  </div>
);

const OutcomeComparisonTable: React.FC<{ title: string; bands: AbandonedCartOutcomeBand[] }> = ({ title, bands }) => (
  <div className="overflow-hidden rounded-xl border bg-white">
    <div className="border-b bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900">{title}</div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[38rem] text-sm">
        <thead className="text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="px-4 py-3">Band</th>
            <th className="px-4 py-3 text-right">Abandoned</th>
            <th className="px-4 py-3 text-right">Direct completion</th>
            <th className="px-4 py-3 text-right">Sample</th>
            <th className="px-4 py-3 text-right">Abandonment rate</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {bands.map((band) => (
            <tr key={band.key}>
              <td className="px-4 py-3 font-medium text-gray-900">{band.label}</td>
              <td className="px-4 py-3 text-right">{band.abandonedCount}</td>
              <td className="px-4 py-3 text-right">{band.completedCount}</td>
              <td className="px-4 py-3 text-right">n={band.sampleSize}</td>
              <td className="px-4 py-3 text-right">
                {band.sufficientSample && band.abandonmentRate !== null ? (
                  <span className="font-semibold text-[#18448D]">{(band.abandonmentRate * 100).toFixed(1)}%</span>
                ) : (
                  <Badge variant="outline" className="whitespace-nowrap text-gray-600">Insufficient sample</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

interface CartCardProps {
  cart: AbandonedCartAdminRecord;
  sending: boolean;
  deleting: boolean;
  onSend: (cart: AbandonedCartAdminRecord, sequenceNumber: number) => void;
  onDelete: (cart: AbandonedCartAdminRecord) => void;
}

const CartCard: React.FC<CartCardProps> = ({ cart, sending, deleting, onSend, onDelete }) => {
  const thumbnail = getThumbnailUrl(cart.first_item_thumbnail);
  const ineligibleReason = recoveryIneligibility(cart);
  const eligible = isRecoveryEmailEligible(cart);
  const snapshotWarning = cart.snapshot_completeness === 'incomplete'
    ? cart.source_item_count !== null
      ? `Captured ${cart.stored_item_count} of ${cart.source_item_count} source cart lines. Captured quantity, item details, and item facets can describe only those ${cart.stored_item_count} lines; cart value was captured separately.`
      : `This cart snapshot is incomplete. ${cart.stored_item_count} lines were captured; quantity, item details, and item facets use only that captured subset.`
    : cart.snapshot_completeness === 'unknown'
      ? `Snapshot completeness is unknown for this historical capture. ${cart.stored_item_count} cart lines were captured; quantity, item details, and item facets use only captured lines.`
      : null;

  return (
    <article className="rounded-xl border bg-white shadow-sm">
      <div className="grid gap-4 p-4 lg:grid-cols-[9rem_minmax(0,1fr)_auto] lg:p-5">
        <div className="h-28 w-full overflow-hidden rounded-lg border bg-gray-50 lg:h-28 lg:w-36">
          {thumbnail ? (
            <img
              src={thumbnail}
              alt="Cart artwork preview"
              className="h-full w-full object-contain"
              onError={(event) => { event.currentTarget.style.display = 'none'; }}
            />
          ) : (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-gray-400">
              <ImageIcon className="h-4 w-4" /> No preview
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                {cart.customer_kind === 'signed_in' ? <UserRound className="h-3.5 w-3.5" /> : <ShoppingCart className="h-3.5 w-3.5" />}
                {cart.customer_kind === 'signed_in' ? 'Signed-in customer' : 'Guest checkout'}
              </div>
              <h2 className="mt-1 truncate text-base font-semibold text-gray-950">
                {[cart.customer_first_name, cart.customer_last_name].filter(Boolean).join(' ') || cart.email || 'Unidentified visitor'}
              </h2>
              <div className="mt-0.5 truncate text-sm text-gray-600">{cart.email || 'No email captured'}</div>
              {cart.phone && <div className="text-sm text-gray-500">{cart.phone}</div>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{humanize(cart.checkout_stage)}</Badge>
              {cart.has_artwork === true && <Badge variant="outline" className="border-blue-200 text-blue-700">Artwork</Badge>}
              {cart.has_artwork === null && <Badge variant="outline" className="text-gray-500">Artwork unknown</Badge>}
              {statusBadge(cart.recovery_status)}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <div className="text-xs text-gray-500">Captured cart value</div>
              <div className="font-semibold text-[#18448D]">{formatCents(cart.captured_value_cents)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Captured quantity</div>
              <div className="font-medium">{cart.item_quantity} across {cart.stored_item_count} captured line{cart.stored_item_count === 1 ? '' : 's'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Last activity</div>
              <div className="font-medium">{getTimeSince(cart.last_activity_at)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Recovery emails</div>
              <div className="font-medium">{cart.recovery_emails_sent} of 3 sent</div>
            </div>
          </div>
          {snapshotWarning && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{snapshotWarning}</span>
            </div>
          )}
        </div>

        <div className="flex min-w-[11rem] flex-col gap-2 lg:border-l lg:pl-4">
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((sequence) => {
              const alreadySent = cart.recovery_emails_sent >= sequence;
              const outOfSequence = sequence > cart.recovery_emails_sent + 1;
              return (
                <Button
                  key={sequence}
                  size="sm"
                  variant={alreadySent ? 'outline' : 'default'}
                  aria-label={`Send recovery email ${sequence}`}
                  onClick={() => onSend(cart, sequence)}
                  disabled={sending || !eligible || alreadySent || outOfSequence}
                >
                  {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Mail className="mr-1 h-3.5 w-3.5" />{sequence}</>}
                </Button>
              );
            })}
          </div>
          {ineligibleReason ? (
            <div className="flex items-start gap-1.5 text-xs text-amber-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{ineligibleReason}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-green-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> Eligible for next email
            </div>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDelete(cart)}
            disabled={deleting}
            className="mt-auto text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            Delete cart
          </Button>
        </div>
      </div>

      <details className="border-t px-4 py-3 lg:px-5">
        <summary className="cursor-pointer text-sm font-medium text-[#18448D]">View cart and recovery details</summary>
        <div className="mt-4">
          <RecoveryFunnel cart={cart} />
        </div>
        <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Items</div>
            <div className="mt-2 overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[44rem] text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">Size</th>
                    <th className="px-3 py-2">Area</th>
                    <th className="px-3 py-2">Material</th>
                    <th className="px-3 py-2">Qty</th>
                    <th className="px-3 py-2">Artwork</th>
                    <th className="px-3 py-2 text-right">Line total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {cart.item_summaries.map((item, index) => (
                    <tr key={`${cart.id}-${index}`}>
                      <td className="px-3 py-2">{humanize(item.product_type)}</td>
                      <td className="whitespace-nowrap px-3 py-2">{item.dimensions}</td>
                      <td className="whitespace-nowrap px-3 py-2">{item.area_sqft === null ? 'Unknown' : `${item.area_sqft.toFixed(2)} sq ft`}</td>
                      <td className="px-3 py-2">{item.material}</td>
                      <td className="px-3 py-2">{item.quantity}</td>
                      <td className="px-3 py-2">
                        {item.has_artwork === true ? 'Attached' : item.has_artwork === false ? 'None' : 'Unknown'}
                      </td>
                      <td className="px-3 py-2 text-right">{formatCents(item.line_total_cents)}</td>
                    </tr>
                  ))}
                  {cart.item_summaries.length === 0 && (
                    <tr><td colSpan={7} className="px-3 py-5 text-center text-gray-500">No item summary captured</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {cart.item_summaries_truncated && (
              <p className="mt-2 text-xs text-amber-700">Showing the first 50 stored snapshot lines. Cart-level value was captured separately; item facets use all stored snapshot lines, including any not displayed here.</p>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pricing captured</div>
              <dl className="mt-2 space-y-1.5 text-sm">
                <div className="flex justify-between gap-4"><dt>Subtotal</dt><dd>{formatCents(cart.subtotal_cents)}</dd></div>
                <div className="flex justify-between gap-4"><dt>Discount</dt><dd>{cart.discount_cents === null ? 'Not captured' : `-${formatCents(cart.discount_cents)}`}</dd></div>
                <div className="flex justify-between gap-4"><dt>Tax</dt><dd>{formatCents(cart.tax_cents)}</dd></div>
                <div className="flex justify-between gap-4 border-t pt-1.5 font-semibold"><dt>Estimated total</dt><dd>{formatCents(cart.estimated_total_cents)}</dd></div>
                {cart.recovered_order_id && (
                  <div className="mt-2 flex justify-between gap-4 border-t border-green-200 pt-2 font-semibold text-green-700">
                    <dt>Actual recovered order</dt>
                    <dd>{formatCents(cart.recovered_order_total_cents)}</dd>
                  </div>
                )}
              </dl>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Timeline</div>
              <dl className="mt-2 space-y-1.5 text-sm">
                <div><dt className="text-gray-500">Captured</dt><dd>{formatDate(cart.created_at)}</dd></div>
                <div><dt className="text-gray-500">Last activity</dt><dd>{formatDate(cart.last_activity_at)}</dd></div>
                <div><dt className="text-gray-500">Abandoned</dt><dd>{formatDate(cart.abandoned_at)}</dd></div>
                <div><dt className="text-gray-500">Recovered</dt><dd>{formatDate(cart.recovered_at)}</dd></div>
                <div><dt className="text-gray-500">Recovered order created</dt><dd>{formatDate(cart.recovered_order_created_at)}</dd></div>
                <div><dt className="text-gray-500">Last recovery email</dt><dd>{formatDate(cart.last_recovery_email_at)}</dd></div>
              </dl>
            </div>
            <RecoveryOfferList cart={cart} />
            <RecoveryTimeline cart={cart} />
            {(cart.discount_code || cart.recovered_order_id || cart.recovery_suppression_reason) && (
              <div className="rounded-lg bg-gray-50 p-3 text-sm">
                {cart.discount_code && <div><span className="text-gray-500">Discount code:</span> {cart.discount_code}</div>}
                {cart.recovered_order_id && <div><span className="text-gray-500">Recovered order:</span> {cart.recovered_order_id}</div>}
                {cart.recovered_order_id && <div><span className="text-gray-500">Actual order total:</span> {formatCents(cart.recovered_order_total_cents)}</div>}
                {cart.recovery_status === 'recovered' && cart.abandoned_at && (
                  <div>
                    <span className="text-gray-500">Revenue state:</span>{' '}
                    {cart.recovered_revenue_state === 'retained'
                      ? `Retained (${humanize(cart.recovered_order_status || 'settled')})`
                      : cart.recovered_revenue_state === 'refunded'
                        ? 'Refunded — excluded from retained revenue'
                        : 'Unknown — no verified current order status'}
                  </div>
                )}
                {cart.recovery_suppression_reason && (
                  <div className="text-amber-800"><span className="text-amber-700">Suppression:</span> {humanize(cart.recovery_suppression_reason)}</div>
                )}
              </div>
            )}
          </div>
        </div>
      </details>
    </article>
  );
};

const AbandonedCarts: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [carts, setCarts] = useState<AbandonedCartAdminRecord[]>([]);
  const [serverAnalytics, setServerAnalytics] = useState<AbandonedCartAnalytics | null>(null);
  const [filteredAnalytics, setFilteredAnalytics] = useState<AbandonedCartAnalytics | null>(null);
  const [outcomeComparison, setOutcomeComparison] = useState<AbandonedCartOutcomeComparison | null>(null);
  const [filters, setFilters] = useState<AbandonedCartFilters>({ ...EMPTY_ABANDONED_CART_FILTERS });
  const [appliedFilters, setAppliedFilters] = useState<AbandonedCartFilters>({ ...EMPTY_ABANDONED_CART_FILTERS });
  const [sort, setSort] = useState<AbandonedCartSort>('activity_desc');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<CartPagination>(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(true);
  const [sendingEmail, setSendingEmail] = useState<Record<string, boolean>>({});
  const [deletingCart, setDeletingCart] = useState<Record<string, boolean>>({});
  const [cartToDelete, setCartToDelete] = useState<AbandonedCartAdminRecord | null>(null);
  const loadRequestId = useRef(0);

  const loadCarts = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: String(CARTS_PER_PAGE),
        sort,
      });
      if (appliedFilters.fromDate) params.set('from', appliedFilters.fromDate);
      if (appliedFilters.toDate) params.set('to', appliedFilters.toDate);
      if (appliedFilters.sizeQuery) params.set('size', appliedFilters.sizeQuery);
      if (appliedFilters.minValue) params.set('min_value', appliedFilters.minValue);
      if (appliedFilters.maxValue) params.set('max_value', appliedFilters.maxValue);
      if (appliedFilters.checkoutStage !== 'all') params.set('stage', appliedFilters.checkoutStage);
      if (appliedFilters.emailPresence !== 'all') params.set('email', appliedFilters.emailPresence);
      if (appliedFilters.recoveryStatus !== 'all') params.set('status', appliedFilters.recoveryStatus);
      const response = await adminFetch(`/.netlify/functions/get-abandoned-carts?${params.toString()}`, { cache: 'no-store' });
      if (requestId !== loadRequestId.current) return;
      const data = await response.json();
      if (requestId !== loadRequestId.current) return;
      if (!response.ok) throw new Error(data?.message || data?.error || 'Failed to fetch abandoned carts');
      setCarts(Array.isArray(data.carts) ? data.carts : []);
      setServerAnalytics(data.analytics || null);
      setFilteredAnalytics(data.filteredAnalytics || data.analytics || null);
      setOutcomeComparison(data.outcomeComparison || data.analytics?.outcomeComparison || null);
      setPagination(data.pagination || EMPTY_PAGINATION);
    } catch (error) {
      if (requestId !== loadRequestId.current) return;
      console.error('Error loading abandoned carts:', error);
      toast({
        title: 'Could not load abandoned carts',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      if (requestId === loadRequestId.current) setLoading(false);
    }
  }, [appliedFilters, page, sort, toast]);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !isAdmin(user)) {
      loadRequestId.current += 1;
      setLoading(false);
      return;
    }
    void loadCarts();
    return () => { loadRequestId.current += 1; };
  }, [user, authLoading, loadCarts]);

  const allAnalytics = serverAnalytics || summarizeAbandonedCarts(carts);
  const matchingAnalytics = filteredAnalytics || summarizeAbandonedCarts(carts);

  const setFilter = <Key extends keyof AbandonedCartFilters>(key: Key, value: AbandonedCartFilters[Key]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const applyFilters = () => {
    const size = filters.sizeQuery.trim();
    if (size && !/^\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?$/i.test(size.replace(/["″']/g, ''))) {
      toast({
        title: 'Check the size filter',
        description: 'Enter a width and height such as 48x24.',
        variant: 'destructive',
      });
      return;
    }
    const min = filters.minValue.trim() ? Number(filters.minValue) : null;
    const max = filters.maxValue.trim() ? Number(filters.maxValue) : null;
    if ((min !== null && (!Number.isFinite(min) || min < 0))
      || (max !== null && (!Number.isFinite(max) || max < 0))
      || (min !== null && max !== null && min > max)) {
      toast({
        title: 'Check the cart value range',
        description: 'Use non-negative amounts and keep the minimum at or below the maximum.',
        variant: 'destructive',
      });
      return;
    }
    setPage(1);
    setAppliedFilters({ ...filters, sizeQuery: size });
  };

  const clearFilters = () => {
    const cleared = { ...EMPTY_ABANDONED_CART_FILTERS };
    setFilters(cleared);
    setAppliedFilters(cleared);
    setPage(1);
  };

  useEffect(() => {
    if (page > pagination.totalPages) setPage(pagination.totalPages);
  }, [page, pagination.totalPages]);

  const sendRecoveryEmail = async (cart: AbandonedCartAdminRecord, sequenceNumber: number) => {
    if (!isRecoveryEmailEligible(cart)) return;
    try {
      setSendingEmail((current) => ({ ...current, [cart.id]: true }));
      const response = await adminFetch('/.netlify/functions/send-abandoned-cart-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cartId: cart.id, sequenceNumber }),
      });
      const result = await response.json();
      if (!response.ok || result?.skipped) {
        throw new Error(result?.message || result?.reason || result?.error || (typeof result === 'string' ? result : JSON.stringify(result)) || 'Recovery email was not sent');
      }
      toast({
        title: `Recovery email ${sequenceNumber} sent`,
        description: result.discountCode ? `Discount code ${result.discountCode} was included.` : `Sent to ${cart.email}.`,
      });
      await loadCarts();
    } catch (error) {
      console.error('Error sending recovery email:', error);
      toast({
        title: 'Recovery email not sent',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSendingEmail((current) => ({ ...current, [cart.id]: false }));
    }
  };

  const deleteCart = async () => {
    if (!cartToDelete) return;
    const cart = cartToDelete;
    setCartToDelete(null);
    try {
      setDeletingCart((current) => ({ ...current, [cart.id]: true }));
      const response = await adminFetch('/.netlify/functions/delete-abandoned-cart', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cartId: cart.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.message || result?.error || 'Failed to delete cart');
      toast({ title: 'Cart deleted', description: `${cart.email || 'Guest cart'} was removed.` });
      await loadCarts();
    } catch (error) {
      console.error('Error deleting abandoned cart:', error);
      toast({
        title: 'Cart was not deleted',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDeletingCart((current) => ({ ...current, [cart.id]: false }));
    }
  };

  if (authLoading) {
    return <Layout><div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#18448D]" /></div></Layout>;
  }

  if (!user || !isAdmin(user)) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] items-center justify-center px-4">
          <div className="text-center">
            <Shield className="mx-auto mb-4 h-12 w-12 text-gray-400" />
            <h1 className="text-2xl font-bold">Access denied</h1>
            <p className="mb-4 mt-2 text-gray-600">A verified administrator session is required.</p>
            <Button onClick={() => navigate('/admin/setup')}>Admin sign in</Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <AlertDialog open={Boolean(cartToDelete)} onOpenChange={(open) => { if (!open) setCartToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete abandoned cart?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the cart record for {cartToDelete?.email || 'this guest visitor'}, including its recovery history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void deleteCart()} className="bg-red-600 hover:bg-red-700">Delete cart</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <main className="container mx-auto px-4 py-6 sm:py-8">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-3">
              <ShoppingCart className="h-7 w-7 text-[#18448D]" />
              <h1 className="text-2xl font-bold sm:text-3xl">Abandoned Cart Analytics</h1>
            </div>
            <p className="mt-1 text-sm text-gray-600">Checkout behavior, recovery eligibility, and item-level demand.</p>
          </div>
          <Button onClick={() => void loadCarts()} disabled={loading} variant="outline" className="w-full sm:w-auto">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        <nav className="mt-6 overflow-x-auto pb-1" aria-label="Admin sections">
          <Tabs value="abandoned-carts" className="min-w-max">
            <TabsList className="h-auto flex-wrap justify-start">
              <TabsTrigger value="orders" asChild><Link to="/admin/orders" className="gap-2"><Package className="h-4 w-4" />Orders</Link></TabsTrigger>
              <TabsTrigger value="customers" asChild><Link to="/admin/customers" className="gap-2"><UsersRound className="h-4 w-4" />Customers</Link></TabsTrigger>
              <TabsTrigger value="abandoned-carts" className="gap-2"><ShoppingCart className="h-4 w-4" />Abandoned Carts</TabsTrigger>
            </TabsList>
          </Tabs>
        </nav>

        <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="All-time abandoned cart metrics">
          <div className="min-w-0 rounded-lg border bg-white p-4"><div className="text-xs text-gray-500">Open carts</div><div className="mt-1 break-words text-lg font-bold sm:text-2xl">{allAnalytics.activeCount + allAnalytics.abandonedCount}</div></div>
          <div className="min-w-0 rounded-lg border bg-white p-4"><div className="text-xs text-gray-500">Open captured value</div><div className="mt-1 break-words text-lg font-bold sm:text-2xl">{formatCents(allAnalytics.activeValueCents)}</div></div>
          <div className="min-w-0 rounded-lg border border-green-200 bg-green-50 p-4"><div className="text-xs text-green-700">Exact retained recovery revenue</div><div className="mt-1 break-words text-lg font-bold text-green-700 sm:text-2xl">{formatCents(allAnalytics.recoveredValueCents)}</div><div className="text-xs text-green-700">{allAnalytics.recoveredRetainedCount} retained of {allAnalytics.recoveredCount} recorded recovery events</div><div className="mt-1 text-[11px] text-green-800">{allAnalytics.recoveredRefundedCount} refunded · {allAnalytics.recoveredRevenueUnknownCount} link/status unknown</div></div>
          <div className="min-w-0 rounded-lg border border-blue-200 bg-blue-50 p-4"><div className="text-xs text-blue-700">Exact retained revenue after email</div><div className="mt-1 break-words text-lg font-bold text-blue-700 sm:text-2xl">{formatCents(allAnalytics.recoveredAfterEmailValueCents)}</div><div className="text-xs text-blue-700">{allAnalytics.recoveredAfterEmailRetainedCount} retained of {allAnalytics.recoveredAfterEmailCount} after-email recovery events</div><div className="mt-1 text-[11px] text-blue-800">Correlation only; not causal attribution</div></div>
          <div className="col-span-2 min-w-0 rounded-lg border border-amber-200 bg-amber-50 p-4 lg:col-span-1"><div className="text-xs text-amber-800">Recorded cart suppressions</div><div className="mt-1 break-words text-lg font-bold text-amber-800 sm:text-2xl">{allAnalytics.suppressedCount}</div><div className="text-xs text-amber-700">Stored on cart; controls also honor current suppression sources</div></div>
        </section>
        <p className="mt-2 text-xs leading-5 text-gray-500">
          Retained recovery revenue uses the actual total on an exactly linked, settled order. Refunded links and historical missing or unverifiable links are excluded rather than assumed retained.
        </p>

        <section className="mt-6 rounded-xl border bg-white p-4" aria-label="Cart filters">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            <div><Label htmlFor="cart-from">Captured from (UTC)</Label><Input id="cart-from" type="date" value={filters.fromDate} onChange={(event) => setFilter('fromDate', event.target.value)} className="mt-1" /></div>
            <div><Label htmlFor="cart-to">Captured through (UTC)</Label><Input id="cart-to" type="date" value={filters.toDate} onChange={(event) => setFilter('toDate', event.target.value)} className="mt-1" /></div>
            <div><Label htmlFor="cart-size">Size</Label><Input id="cart-size" placeholder="e.g. 48x24" value={filters.sizeQuery} onChange={(event) => setFilter('sizeQuery', event.target.value)} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-2"><div><Label htmlFor="cart-min">Min value</Label><Input id="cart-min" inputMode="decimal" placeholder="$0" value={filters.minValue} onChange={(event) => setFilter('minValue', event.target.value)} className="mt-1" /></div><div><Label htmlFor="cart-max">Max value</Label><Input id="cart-max" inputMode="decimal" placeholder="Any" value={filters.maxValue} onChange={(event) => setFilter('maxValue', event.target.value)} className="mt-1" /></div></div>
            <div><Label htmlFor="cart-stage">Checkout stage</Label><Select value={filters.checkoutStage} onValueChange={(value) => setFilter('checkoutStage', value)}><SelectTrigger id="cart-stage" className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All stages</SelectItem>{STAGE_OPTIONS.map((stage) => <SelectItem key={stage} value={stage}>{humanize(stage)}</SelectItem>)}</SelectContent></Select></div>
            <div><Label htmlFor="cart-email-presence">Email</Label><Select value={filters.emailPresence} onValueChange={(value) => setFilter('emailPresence', value as AbandonedCartFilters['emailPresence'])}><SelectTrigger id="cart-email-presence" className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All carts</SelectItem><SelectItem value="with_email">Email captured</SelectItem><SelectItem value="without_email">No email</SelectItem></SelectContent></Select></div>
            <div><Label htmlFor="cart-recovery-status">Recovery status</Label><Select value={filters.recoveryStatus} onValueChange={(value) => setFilter('recoveryStatus', value)}><SelectTrigger id="cart-recovery-status" className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{STATUS_OPTIONS.map((status) => <SelectItem key={status} value={status}>{humanize(status)}</SelectItem>)}</SelectContent></Select></div>
            <div><Label htmlFor="cart-sort">Sort</Label><Select value={sort} onValueChange={(value) => { setPage(1); setSort(value as AbandonedCartSort); }}><SelectTrigger id="cart-sort" className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="activity_desc">Recent activity</SelectItem><SelectItem value="captured_desc">Newest captured</SelectItem><SelectItem value="captured_asc">Oldest captured</SelectItem><SelectItem value="value_desc">Highest value</SelectItem><SelectItem value="value_asc">Lowest value</SelectItem><SelectItem value="quantity_desc">Highest quantity</SelectItem></SelectContent></Select></div>
          </div>
          <div className="mt-4 flex flex-col justify-between gap-2 border-t pt-4 sm:flex-row sm:items-center">
            <div className="text-sm text-gray-600">
              Showing <strong>{carts.length}</strong> of {pagination.totalItems} matching carts · Page {pagination.page} of {pagination.totalPages} · {matchingAnalytics.withEmailCount} with email
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={clearFilters}><FilterX className="mr-2 h-4 w-4" />Clear filters</Button>
              <Button size="sm" onClick={applyFilters} disabled={loading}>Apply filters</Button>
            </div>
          </div>
        </section>

        <div className="mt-6 text-sm text-gray-600">
          Breakdown based on <strong>{matchingAnalytics.abandonmentCohortCount}</strong> matching cart{matchingAnalytics.abandonmentCohortCount === 1 ? '' : 's'} with a recorded abandonment event. Counts are calculated across every matching result, not only this page. Size, material, and product facets use captured snapshot lines; omitted or historically unverifiable source lines cannot contribute. Value and checkout-stage bands remain cart-level.
        </div>
        <section className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" aria-label="Filtered abandonment breakdowns">
          <FacetList title="Top sizes by carts" values={matchingAnalytics.topSizes} />
          <FacetList title="Top materials by carts" values={matchingAnalytics.topMaterials} />
          <FacetList title="Top products by carts" values={matchingAnalytics.topProducts} />
          <FacetList title="Value bands by carts" values={matchingAnalytics.valueBands} />
          <FacetList title="Checkout stages" values={matchingAnalytics.checkoutStages} />
        </section>

        {outcomeComparison && (
          <section className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5" aria-labelledby="terminal-outcome-heading">
            <div className="max-w-4xl">
              <h2 id="terminal-outcome-heading" className="text-lg font-bold text-gray-950">All-time terminal cart outcome comparison</h2>
              <p className="mt-1 text-sm leading-6 text-gray-600">
                Uses {outcomeComparison.terminalSampleSize} post-rollout carts with a recorded known checkout stage and terminal outcome. “Abandoned” means an abandonment event was recorded, including carts later recovered; “Direct completion” means checkout completed without a recorded abandonment. Active/censored carts and historical unknown-stage records are excluded.
              </p>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                Rates appear only with at least {outcomeComparison.minimumSampleSize} carts in a band and at least {outcomeComparison.minimumOutcomeCount} outcomes on each side. Raw sample counts remain visible below that threshold.
              </p>
            </div>
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <div>
                <OutcomeComparisonTable title={`Banner size · n=${outcomeComparison.sizeClassifiedSampleSize}`} bands={outcomeComparison.sizeBands} />
                <p className="mt-2 text-xs text-gray-500">Each cart is counted once using its largest captured banner item. Bands follow the Size Guide: Large begins at 3×6 (18 sq ft). Explicit non-banner products and unknown areas are excluded; legacy items with no product type use the API’s banner default. Snapshot omissions can prevent a cart from being size-classified.</p>
              </div>
              <div>
                <OutcomeComparisonTable title={`Captured cart value · n=${outcomeComparison.valueClassifiedSampleSize}`} bands={outcomeComparison.valueBands} />
                <p className="mt-2 text-xs text-gray-500">Each terminal cart is counted once using its captured estimated total, then captured subtotal, then the legacy cart-total fallback when newer fields are unavailable.</p>
              </div>
            </div>
          </section>
        )}

        <section className="mt-6" aria-label="Abandoned carts">
          {loading ? (
            <div className="flex items-center justify-center rounded-xl border bg-white py-16"><Loader2 className="h-8 w-8 animate-spin text-[#18448D]" /></div>
          ) : carts.length === 0 ? (
            <div className="rounded-xl border bg-white py-16 text-center"><ShoppingCart className="mx-auto h-10 w-10 text-gray-300" /><p className="mt-3 font-medium text-gray-700">No carts match these filters</p><p className="text-sm text-gray-500">Clear filters or choose a wider range.</p></div>
          ) : (
            <div className="space-y-4">
              {carts.map((cart) => (
                <CartCard
                  key={cart.id}
                  cart={cart}
                  sending={Boolean(sendingEmail[cart.id])}
                  deleting={Boolean(deletingCart[cart.id])}
                  onSend={(selectedCart, sequence) => void sendRecoveryEmail(selectedCart, sequence)}
                  onDelete={setCartToDelete}
                />
              ))}
            </div>
          )}
        </section>

        {!loading && pagination.totalPages > 1 && (
          <nav className="mt-6 flex flex-col items-center justify-between gap-3 rounded-xl border bg-white p-4 sm:flex-row" aria-label="Abandoned cart result pages">
            <Button type="button" variant="outline" disabled={!pagination.hasPrevious} onClick={() => setPage((current) => Math.max(1, current - 1))}>
              Previous page
            </Button>
            <div className="text-sm text-gray-600">Page <strong>{pagination.page}</strong> of {pagination.totalPages} · {pagination.totalItems} results</div>
            <Button type="button" variant="outline" disabled={!pagination.hasNext} onClick={() => setPage((current) => current + 1)}>
              Next page
            </Button>
          </nav>
        )}
      </main>
    </Layout>
  );
};

export default AbandonedCarts;
