import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { adminFetch } from '@/lib/serverAuth';
import { orderArtworkResolution } from '@/lib/artworkResolution';

export default function AIArtworkQuality({ item, orderId }: { item: any; orderId: string }) {
  const resolution = orderArtworkResolution(item);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const download = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await adminFetch('/.netlify/functions/admin-ai-production-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId, itemId: item.id }) });
      const result = await response.json();
      if (!response.ok || !result.downloadUrl) throw new Error(result.error || 'Unable to prepare the image.');
      const file = await fetch(result.downloadUrl);
      if (!file.ok) throw new Error('The production image could not be downloaded. Please try again.');
      const blob = await file.blob();
      if (!blob.size) throw new Error('The image download was empty. Please try again.');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = result.filename;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to prepare the image.'); }
    finally { setBusy(false); }
  };
  return <div data-ai-artwork-quality className="col-span-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
    <Button type="button" data-admin-ai-resized-file onClick={download} disabled={busy} className="h-auto min-h-11 w-full whitespace-normal bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800">
      {busy ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Preparing image…</> : <><Download className="mr-1.5 h-4 w-4" />Download AI Artwork · JPG</>}
    </Button>
    <p className="mt-2 font-bold">{item.width_in}″ × {item.height_in}″ · Full size · 150 DPI</p>
    <p className="mt-1">Print at 100%. No doubling or size correction needed.</p>
    <p className="mt-1 text-[11px]">{resolution ? `Native source detail: ${resolution.ppi.toFixed(1)} PPI. ` : ''}The export preserves the saved design and resamples to the ordered size; it does not recreate missing detail.</p>
    {error && <p role="alert" className="mt-2 font-semibold text-red-800">{error}</p>}
  </div>;
}
