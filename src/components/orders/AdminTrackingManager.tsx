import React, { useEffect, useMemo, useState } from 'react';
import { Edit3, Loader2, Mail, Plus, Save, Trash2, Truck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import type { Order } from '@/lib/orders/types';
import type { TrackingEntry } from '@/lib/orders/tracking';
import { DEFAULT_TRACKING_CARRIER, fedexUrl, normalizeTrackingEntries } from '@/lib/orders/tracking';
import { adminFetch } from '@/lib/serverAuth';

interface AdminTrackingManagerProps {
  order: Order;
  onUpdated?: (next: Partial<Order>) => void;
}

const emptyRow = (index = 0): TrackingEntry => ({
  carrier: DEFAULT_TRACKING_CARRIER,
  trackingNumber: '',
  label: `Package ${index + 1}`,
});

const normalizeDraftRows = (rows: TrackingEntry[]): TrackingEntry[] => {
  const cleaned = rows.map((row, index) => ({
    carrier: DEFAULT_TRACKING_CARRIER,
    trackingNumber: String(row.trackingNumber || '').trim(),
    label: String(row.label || '').trim() || `Package ${index + 1}`,
  }));

  if (cleaned.some((row) => !row.trackingNumber)) {
    throw new Error('Every package needs a tracking number before saving.');
  }

  const uniqueNumbers = new Set(cleaned.map((row) => row.trackingNumber.toLowerCase()));
  if (uniqueNumbers.size !== cleaned.length) {
    throw new Error('Duplicate tracking numbers are not allowed.');
  }

  return cleaned;
};

const readJson = async (response: Response): Promise<Record<string, any>> => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 400) };
  }
};

const AdminTrackingManager: React.FC<AdminTrackingManagerProps> = ({ order, onUpdated }) => {
  const { toast } = useToast();
  const storedRows = useMemo(() => normalizeTrackingEntries(order), [order]);
  const [rows, setRows] = useState<TrackingEntry[]>(storedRows);
  const [draftRows, setDraftRows] = useState<TrackingEntry[]>(storedRows.length ? storedRows : [emptyRow()]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [notificationSent, setNotificationSent] = useState(Boolean(order.shipping_notification_sent));
  const [notificationSentAt, setNotificationSentAt] = useState<string | null>(order.shipping_notification_sent_at || null);

  useEffect(() => {
    const nextRows = normalizeTrackingEntries(order);
    setRows(nextRows);
    setDraftRows(nextRows.length ? nextRows : [emptyRow()]);
    setNotificationSent(Boolean(order.shipping_notification_sent));
    setNotificationSentAt(order.shipping_notification_sent_at || null);
    setEditing(false);
  }, [order.id, order.tracking_number, order.tracking_numbers, order.trackingNumbers, order.shipping_notification_sent, order.shipping_notification_sent_at]);

  const refreshAdmin = () => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
      window.setTimeout(() => window.location.reload(), 650);
    }
  };

  const persistRows = async (nextRows: TrackingEntry[]) => {
    setSaving(true);
    try {
      const response = await adminFetch('/.netlify/functions/update-tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: order.id,
          carrier: DEFAULT_TRACKING_CARRIER,
          number: nextRows[0]?.trackingNumber || '',
          trackingNumbers: nextRows,
          isUpdate: true,
        }),
      });
      const result = await readJson(response);
      if (!response.ok || result.ok === false) {
        throw new Error(result.error || `Tracking update failed (HTTP ${response.status})`);
      }

      setRows(nextRows);
      setDraftRows(nextRows.length ? nextRows : [emptyRow()]);
      setEditing(false);
      setNotificationSent(false);
      setNotificationSentAt(null);
      onUpdated?.({
        tracking_number: nextRows[0]?.trackingNumber || null,
        tracking_numbers: nextRows,
        trackingNumbers: nextRows,
        shipping_notification_sent: false,
        shipping_notification_sent_at: null,
        shipping_notification_status: 'pending',
        status: result.status || order.status,
      });

      toast({
        title: nextRows.length ? 'Tracking saved' : 'Tracking deleted',
        description: nextRows.length
          ? 'Tracking was saved. Use Send Tracking Email when you are ready to notify the customer.'
          : 'All tracking numbers were removed. No email was sent.',
      });
      refreshAdmin();
    } catch (error) {
      toast({
        title: 'Tracking update failed',
        description: error instanceof Error ? error.message : 'Could not update tracking.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = async () => {
    try {
      const cleaned = normalizeDraftRows(draftRows);
      await persistRows(cleaned);
    } catch (error) {
      toast({
        title: 'Check tracking information',
        description: error instanceof Error ? error.message : 'Tracking information is invalid.',
        variant: 'destructive',
      });
    }
  };

  const deleteRow = async (index: number) => {
    const target = rows[index];
    if (!target) return;
    const confirmed = window.confirm(`Delete tracking number ${target.trackingNumber}?`);
    if (!confirmed) return;
    await persistRows(rows.filter((_, rowIndex) => rowIndex !== index));
  };

  const sendTrackingEmail = async () => {
    if (!rows.length) {
      toast({
        title: 'Tracking required',
        description: 'Add at least one tracking number before sending the tracking email.',
        variant: 'destructive',
      });
      return;
    }

    setSending(true);
    try {
      const endpoint = notificationSent
        ? '/.netlify/functions/resend-tracking-email'
        : '/.netlify/functions/send-shipping-notification';
      const response = await adminFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id }),
      });
      const result = await readJson(response);
      if (!response.ok || result.ok === false || !result.emailId) {
        throw new Error(result.error || `Tracking email failed (HTTP ${response.status})`);
      }

      const sentAt = result.sentAt || new Date().toISOString();
      setNotificationSent(true);
      setNotificationSentAt(sentAt);
      onUpdated?.({
        shipping_notification_sent: true,
        shipping_notification_sent_at: sentAt,
        shipping_notification_status: 'sent',
        status: 'shipped',
      });

      toast({
        title: notificationSent ? 'Tracking email resent' : 'Tracking email sent',
        description: `The tracking email was accepted for delivery to ${order.email || 'the customer'}.`,
      });
      refreshAdmin();
    } catch (error) {
      toast({
        title: 'Tracking email failed',
        description: error instanceof Error ? error.message : 'Could not send the tracking email.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-4" aria-labelledby={`tracking-manager-${order.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id={`tracking-manager-${order.id}`} className="flex items-center gap-2 text-sm font-bold text-[#18448D]">
            <Truck className="h-4 w-4" />
            Tracking & customer notification
          </h3>
          <p className="mt-1 text-xs text-gray-600">Saving tracking does not send an email. Send it separately when the package is ready.</p>
        </div>
        {!editing && (
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => {
            setDraftRows(rows.length ? rows : [emptyRow()]);
            setEditing(true);
          }}>
            <Edit3 className="mr-1 h-3 w-3" />
            {rows.length ? 'Edit Tracking' : 'Add Tracking'}
          </Button>
        )}
      </div>

      {!editing && rows.length > 0 && (
        <div className="mt-3 space-y-2">
          {rows.map((row, index) => (
            <div key={`${row.trackingNumber}-${index}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-100 bg-white p-3">
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-800">FEDEX</span>
              <span className="text-xs font-semibold text-gray-700">{row.label || `Package ${index + 1}`}</span>
              <a href={fedexUrl(row.trackingNumber)} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 break-all font-mono text-xs text-blue-700 underline">
                {row.trackingNumber}
              </a>
              <Button type="button" size="sm" variant="outline" className="h-8 border-red-200 px-2 text-xs text-red-700 hover:bg-red-50" onClick={() => void deleteRow(index)} disabled={saving}>
                <Trash2 className="mr-1 h-3 w-3" />
                Delete
              </Button>
            </div>
          ))}
        </div>
      )}

      {!editing && rows.length === 0 && (
        <div className="mt-3 rounded-lg border border-dashed border-blue-200 bg-white p-3 text-xs text-gray-600">No tracking numbers saved.</div>
      )}

      {editing && (
        <div className="mt-3 space-y-3 rounded-lg border border-blue-200 bg-white p-3">
          {draftRows.map((row, index) => (
            <div key={index} className="relative grid gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 pr-11 sm:grid-cols-2">
              <Button type="button" size="sm" variant="ghost" className="absolute right-2 top-2 h-7 px-2 text-red-600" aria-label={`Remove package ${index + 1}`} onClick={() => setDraftRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}>
                <X className="h-3 w-3" />
              </Button>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-gray-700">Tracking Number</span>
                <Input value={row.trackingNumber} onChange={(event) => setDraftRows((current) => current.map((entry, rowIndex) => rowIndex === index ? { ...entry, trackingNumber: event.target.value } : entry))} placeholder="FedEx tracking number" className="h-9 text-sm" />
              </label>
              <label className="space-y-1 sm:pr-7">
                <span className="text-xs font-semibold text-gray-700">Package Label</span>
                <Input value={row.label || ''} onChange={(event) => setDraftRows((current) => current.map((entry, rowIndex) => rowIndex === index ? { ...entry, label: event.target.value } : entry))} placeholder={`Package ${index + 1}`} className="h-9 text-sm" />
              </label>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setDraftRows((current) => [...current, emptyRow(current.length)])}>
              <Plus className="mr-1 h-3 w-3" />
              Add Another Tracking Number
            </Button>
            <Button type="button" size="sm" className="h-8 text-xs" onClick={() => void saveDraft()} disabled={saving || draftRows.length === 0}>
              {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
              Save Tracking
            </Button>
            {draftRows.length === 0 && rows.length > 0 && (
              <Button type="button" size="sm" variant="destructive" className="h-8 text-xs" onClick={() => void persistRows([])} disabled={saving}>
                <Trash2 className="mr-1 h-3 w-3" />
                Delete All Tracking
              </Button>
            )}
            <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => {
              setDraftRows(rows.length ? rows : [emptyRow()]);
              setEditing(false);
            }} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-blue-100 pt-3">
        <Button type="button" size="sm" onClick={() => void sendTrackingEmail()} disabled={sending || saving || rows.length === 0} className="h-9 bg-[#18448D] text-xs hover:bg-[#12366f]">
          {sending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Mail className="mr-1 h-3 w-3" />}
          {sending ? 'Sending…' : notificationSent ? 'Resend Tracking Email' : 'Send Tracking Email'}
        </Button>
        <div className="text-xs text-gray-600">
          {notificationSentAt
            ? `Last tracking email sent ${new Date(notificationSentAt).toLocaleString()}`
            : 'Tracking email has not been sent yet.'}
        </div>
      </div>
    </section>
  );
};

export default AdminTrackingManager;
