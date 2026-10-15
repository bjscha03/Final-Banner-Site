import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
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
      const response = await adminFetch('/.netlify/functions/admin-ai-artwork-proof', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId, itemId: item.id }) });
      if (!response.ok) throw new Error((await response.json()).error || 'Unable to prepare the proof.');
      const ppi = Number(response.headers.get('X-Artwork-Effective-PPI'));
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url;
      link.download = `ai-proof-${item.id.slice(-8)}-${item.width_in}x${item.height_in}in.pdf`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      if (ppi && ppi < 200) setError(`Proof downloaded at the correct size. Source detail is ${ppi.toFixed(1)} PPI; it does not meet the 200 PPI minimum.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to prepare the proof.'); }
    finally { setBusy(false); }
  };
  return <div data-ai-artwork-quality className={`col-span-full rounded-lg border p-3 text-xs ${resolution?.meetsMinimum ? 'border-slate-200 bg-slate-50 text-slate-800' : 'border-red-200 bg-red-50 text-red-900'}`}>
    <p className="font-bold">AI artwork · {item.width_in}″ × {item.height_in}″</p>
    <p className="mt-1">{resolution ? `${resolution.ppi.toFixed(1)} PPI of source detail at this print size` : 'Source resolution is unverified'}</p>
    <p className="mt-1">{resolution?.meetsPreferred ? 'Meets the 300 PPI resolution target.' : resolution?.meetsMinimum ? 'Meets the 200 PPI minimum; 300 PPI is preferred.' : 'Below the 200 PPI minimum. Request higher-resolution or vector artwork before production.'}</p>
    {resolution && !resolution.meetsPreferred && <p className="mt-1">200 PPI: {resolution.minimumWidth.toLocaleString()} × {resolution.minimumHeight.toLocaleString()} px · 300 PPI: {resolution.preferredWidth.toLocaleString()} × {resolution.preferredHeight.toLocaleString()} px</p>}
    <Button type="button" size="sm" variant="outline" className="mt-2 h-auto min-h-9 w-full whitespace-normal bg-white text-xs text-slate-800" onClick={download} disabled={busy}>{busy ? 'Preparing proof…' : 'Download Full-Size Proof PDF'}</Button>
    <p className="mt-1 text-[11px]">The PDF sets the exact ordered size and keeps the saved artwork. It does not add missing image detail.</p>
    {error && <p role="status" className="mt-2 font-semibold">{error}</p>}
  </div>;
}
