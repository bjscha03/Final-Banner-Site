import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Sparkles, Undo2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { authenticatedJsonBody, authorizedHeaders } from '@/lib/serverAuth';
import type { UploadedArtworkFile } from '@/lib/cartArtworkForEditor';
import { fetchAIJson } from './ai/jobRequest';
import { runBackgroundJob } from './ai/backgroundJob';
import { artworkFitIdentity, canApplyArtworkFit, prepareArtworkFitSource, saveFittedArtwork, type ArtworkFitResult } from './ai/artworkFit';
import { logUx } from '@/lib/uxAnalytics';

export function ArtworkFitButton({ onClick, disabled, onRestore }: { onClick: () => void; disabled?: boolean; onRestore?: () => void }) {
  return <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50/70 p-3">
    <p className="text-sm font-semibold text-slate-900">Need a better fit for this size?</p>
    <p className="mt-1 text-xs leading-relaxed text-slate-600">Let AI rearrange your existing design. Compare it before making a change.</p>
    <div className="mt-2 flex flex-wrap gap-2">
      <button type="button" disabled={disabled} onClick={onClick} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"><Sparkles className="h-4 w-4" aria-hidden="true" />Fit my design with AI</button>
      {onRestore && <button type="button" disabled={disabled} onClick={onRestore} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"><Undo2 className="h-4 w-4" aria-hidden="true" />Restore original</button>}
    </div>
  </div>;
}

type Props = {
  open: boolean; onOpenChange: (open: boolean) => void; artwork: UploadedArtworkFile | null;
  widthIn: number; heightIn: number;
  onApply: (artwork: UploadedArtworkFile, expectedIdentity: string) => void;
};

export default function AIArtworkFitDialog({ open, onOpenChange, artwork, widthIn, heightIn, onApply }: Props) {
  const identity = artworkFitIdentity(artwork, widthIn, heightIn);
  const identityRef = useRef(identity); identityRef.current = identity;
  const [source, setSource] = useState('');
  const [result, setResult] = useState<ArtworkFitResult | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [stage, setStage] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [readinessAttempt, setReadinessAttempt] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const savedResult = useRef<{ id: string; artwork: UploadedArtworkFile } | null>(null);

  useEffect(() => {
    controller.current?.abort(); inFlight.current = false; savedResult.current = null;
    setSource(''); setResult(null); setReady(false); setBusy(false); setApplying(false); setReviewed(false); setAttempt(0); setError(''); setZoom(false);
  }, [identity]);
  useEffect(() => () => controller.current?.abort(), []);

  useEffect(() => {
    if (!open) { setLoading(false); return; }
    if (!artwork) return;
    let cancelled = false;
    setReady(false); setLoading(true); setError('');
    const currentIdentity = identity;
    void Promise.all([
      fetchAIJson('/.netlify/functions/ai-designer-status', {
        method: 'POST', credentials: 'same-origin', headers: authorizedHeaders({ 'Content-Type': 'application/json' }),
        body: authenticatedJsonBody({ mode: 'fit' }),
      }),
      prepareArtworkFitSource(artwork),
    ]).then(([status, image]) => {
      if (cancelled || currentIdentity !== identityRef.current) return;
      setSource(image);
      if (!status.response.ok || !status.body?.ready) throw new Error('AI fitting is temporarily unavailable. Your original is safe. Please try again shortly.');
      setReady(true);
    }).catch(reason => { if (!cancelled) setError(reason.message || 'AI fit could not be opened.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // Refresh on opening or a source/size change, including an explicit retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, identity, readinessAttempt]);

  async function generate(newVersion = false) {
    if (!ready || !source || inFlight.current || applying) return;
    const requestIdentity = identity;
    inFlight.current = true; setBusy(true); setError(''); setReviewed(false);
    const nextAttempt = newVersion ? attempt + 1 : attempt;
    if (newVersion) { setAttempt(nextAttempt); setResult(null); savedResult.current = null; }
    controller.current?.abort();
    const activeController = new AbortController(); controller.current = activeController;
    try {
      logUx('ai_fit_start', { widthIn, heightIn });
      const response = await runBackgroundJob('/.netlify/functions/ai-designer-fit', {
        sourceImage: source, widthIn, heightIn, attempt: nextAttempt,
      }, activeController.signal, 'Preparing your design', setStage, undefined, undefined, requestIdentity);
      if (activeController.signal.aborted || requestIdentity !== identityRef.current) return;
      setResult(response.fit);
      logUx('ai_fit_complete', { widthIn, heightIn, checksPassed: response.fit.verification.passed });
    } catch (reason) {
      if (!activeController.signal.aborted && requestIdentity === identityRef.current) {
        setError(reason instanceof Error ? reason.message : 'AI fit could not finish. Your original is unchanged.');
        logUx('ai_fit_error', { widthIn, heightIn });
      }
    } finally {
      if (controller.current === activeController) { inFlight.current = false; setBusy(false); }
    }
  }

  async function apply() {
    if (!canApplyArtworkFit(result) || !reviewed || applying || inFlight.current) return;
    const requestIdentity = identity; inFlight.current = true; setApplying(true); setError('');
    try {
      const saved = savedResult.current?.id === result.id ? savedResult.current.artwork : await saveFittedArtwork(result);
      savedResult.current = { id: result.id, artwork: saved };
      if (requestIdentity !== identityRef.current) throw new Error('Your artwork or size changed. Reopen AI fit for your current design.');
      onApply(saved, requestIdentity); onOpenChange(false);
      logUx('ai_fit_applied', { widthIn, heightIn });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'We could not save this version. Your original is unchanged.'); }
    finally { inFlight.current = false; setApplying(false); }
  }

  const proposed = result ? `data:${result.mimeType};base64,${result.imageBase64}` : '';
  const canApply = canApplyArtworkFit(result);
  const reviewIssues = result ? [...new Set([...(result.verification.blockingIssues || []), ...result.verification.issues])] : [];
  return <Dialog open={open} onOpenChange={value => { if (!applying) onOpenChange(value); }}>
    <DialogContent className="max-h-[94dvh] w-[calc(100%_-_1rem)] overflow-y-auto p-4 sm:max-w-5xl sm:p-6" onInteractOutside={event => { if (busy || applying) event.preventDefault(); }}>
      <DialogHeader>
        <DialogTitle className="pr-7 text-xl font-bold text-slate-900">Fit your design to {widthIn}″ × {heightIn}″</DialogTitle>
        <DialogDescription className="text-sm leading-relaxed">AI rearranges your existing artwork for this size, with instructions to preserve your wording, logos, photos and style. Your original stays available.</DialogDescription>
      </DialogHeader>
      {loading && <p role="status" className="flex items-center gap-2 py-8"><Loader2 className="h-5 w-5 animate-spin" />Preparing your original artwork…</p>}
      {source && <div className="grid gap-4 sm:grid-cols-2">
        <figure className="min-w-0"><figcaption className="mb-2 text-sm font-bold">Original artwork</figcaption><div className="flex min-h-40 items-center justify-center rounded-xl border bg-slate-100 p-3"><img src={source} alt="Your original design, unchanged" className="max-h-72 max-w-full object-contain" /></div></figure>
        <figure className="min-w-0"><figcaption className="mb-2 text-sm font-bold">{result ? 'Proposed layout' : 'Your selected banner shape'}</figcaption>
          <div className="flex min-h-40 items-center justify-center rounded-xl border bg-slate-100 p-3">
            <div className="relative w-full overflow-hidden bg-white shadow-sm" style={{ aspectRatio: `${widthIn} / ${heightIn}`, maxHeight: 400 }}>
              {proposed ? <button type="button" onClick={() => setZoom(true)} aria-label="Enlarge proposed layout" className="block h-full w-full"><img src={proposed} alt="AI layout at your selected banner dimensions" className="h-full w-full object-contain" /></button>
                : <img src={source} alt="Original artwork fitted proportionally within your selected size" className="absolute inset-0 h-full w-full object-contain opacity-65" />}
            </div>
          </div>
          {result && <button type="button" onClick={() => setZoom(true)} className="min-h-11 text-sm font-semibold text-blue-800 underline">Enlarge to check details</button>}
        </figure>
      </div>}
      {busy && <div role="status" aria-live="polite" className="rounded-xl bg-orange-50 p-4 text-sm text-slate-800"><p className="flex items-center gap-2 font-semibold"><Loader2 className="h-5 w-5 animate-spin text-orange-600" />{stage}</p><p className="mt-2">This can take a few minutes. You can close this window and reopen it while the same request finishes.</p></div>}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {result && !busy && <div className={`rounded-xl border p-4 text-sm ${result.verification.passed ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
        <p className="flex items-center gap-2 font-semibold">{result.verification.passed && <CheckCircle2 className="h-4 w-4" />} {result.verification.passed ? 'Automated wording and design checks passed' : canApply ? 'Review the visual changes' : 'This version needs another attempt'}</p>
        {result.verification.passed ? <p className="mt-1">Please still check every word, phone number, website and logo. Automated checks can miss details.</p> : <><p className="mt-1">{canApply ? 'The wording checks passed. Compare the artwork and review any visual differences below. If you are happy with the result, check the box to use this layout.' : 'We found a wording or essential-content issue, so this version cannot replace your original.'}</p><ul className="mt-2 list-disc pl-5">{reviewIssues.slice(0,4).map((issue,i) => <li key={i}>{issue}</li>)}</ul>{result.verification.missing.length > 0 && <p className="mt-2">Missing or changed wording: {result.verification.missing.join(', ')}</p>}{result.verification.added.length > 0 && <p className="mt-2">Unexpected wording: {result.verification.added.join(', ')}</p>}</>}
      </div>}
      {canApply && !busy && <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-slate-800"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} className="mt-1 h-5 w-5 accent-orange-600" />{result.verification.passed ? 'I checked the wording, logos and images and want to use this layout.' : 'I reviewed the visual changes, checked the wording, logos and images, and want to use this layout.'}</label>}
      <div className="flex flex-wrap gap-2 border-t pt-4">
        <button type="button" disabled={applying} onClick={() => onOpenChange(false)} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">{busy ? 'Close and keep working' : 'Keep original'}</button>
        {error && !ready && !loading && <button type="button" onClick={() => setReadinessAttempt(value => value + 1)} className="min-h-11 rounded-lg bg-orange-600 px-5 py-2 text-sm font-bold text-white">Try opening AI fit again</button>}
        {!result && !busy && (ready || loading) && <button type="button" disabled={!ready || loading || applying} onClick={() => void generate()} className="min-h-11 rounded-lg bg-orange-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">{error ? 'Retry same request' : 'Create fitted version'}</button>}
        {result && !busy && <button type="button" disabled={applying} onClick={() => void generate(true)} className="min-h-11 rounded-lg border border-orange-300 px-4 py-2 text-sm font-semibold text-orange-800 disabled:opacity-50">Try another layout</button>}
        {result && <button type="button" disabled={busy || applying || !reviewed || !canApply} onClick={() => void apply()} className="min-h-11 rounded-lg bg-orange-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">{applying ? 'Saving your layout…' : 'Use this version'}</button>}
      </div>
      <Dialog open={zoom} onOpenChange={setZoom}><DialogContent className="max-h-[94dvh] w-[98vw] max-w-7xl overflow-auto p-3"><DialogTitle>Review your fitted design</DialogTitle><DialogDescription>Zoom in and check the wording, logos and fine details.</DialogDescription><img src={proposed} alt="Full fitted artwork for detailed review" className="h-auto w-full" /></DialogContent></Dialog>
    </DialogContent>
  </Dialog>;
}
