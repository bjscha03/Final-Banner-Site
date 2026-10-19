import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles, Undo2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { authenticatedJsonBody, authorizedHeaders } from '@/lib/serverAuth';
import type { UploadedArtworkFile } from '@/lib/cartArtworkForEditor';
import { fetchAIJson } from './ai/jobRequest';
import { AIRequestRateLimitError, runBackgroundJob } from './ai/backgroundJob';
import { artworkFitIdentity, canApplyArtworkFit, prepareArtworkFitSource, saveFittedArtwork, type ArtworkFitResult, type ArtworkFitProduct } from './ai/artworkFit';
import { logUx } from '@/lib/uxAnalytics';
import {aiProductContext} from './ai/productContext';
import {SpecialtyTemplateGuide} from '@/components/specialty/SpecialtyPreview';

export function ArtworkFitButton({ onClick, disabled, onRestore }: { onClick: () => void; disabled?: boolean; onRestore?: () => void }) {
  return <div className="mt-3 border-t border-slate-100 pt-3">
    <p className="text-sm font-semibold text-slate-900">Need a better fit for this size?</p>
    <p className="mt-1 text-xs leading-relaxed text-slate-600">Let AI fit your design to this size, then approve the preview.</p>
    <div className="mt-2 flex flex-wrap gap-2">
      <button type="button" disabled={disabled} onClick={onClick} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"><Sparkles className="h-4 w-4" aria-hidden="true" />Fit my design with AI</button>
      {onRestore && <button type="button" disabled={disabled} onClick={onRestore} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"><Undo2 className="h-4 w-4" aria-hidden="true" />Restore original</button>}
    </div>
  </div>;
}

type Props = {
  open: boolean; onOpenChange: (open: boolean) => void; artwork: UploadedArtworkFile | null;
  widthIn: number; heightIn: number; productType?: ArtworkFitProduct;
  onApply: (artwork: UploadedArtworkFile, expectedIdentity: string) => void;
};

export default function AIArtworkFitDialog({ open, onOpenChange, artwork, widthIn, heightIn, productType = 'banner', onApply }: Props) {
  const productContext=aiProductContext({productType,widthIn,heightIn});
  const identity = artworkFitIdentity(artwork, widthIn, heightIn, productType);
  const identityRef = useRef(identity); identityRef.current = identity;
  const [source, setSource] = useState('');
  const [result, setResult] = useState<ArtworkFitResult | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [stage, setStage] = useState('Preparing your artwork…');
  const [waitMessageIndex, setWaitMessageIndex] = useState(0);
  const preparedIdentity = useRef('');
  const autoStartedIdentity = useRef('');
  const [attempt, setAttempt] = useState(0);
  const [retryPending, setRetryPending] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [retrySeconds, setRetrySeconds] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [readinessAttempt, setReadinessAttempt] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const savedResult = useRef<{ id: string; artwork: UploadedArtworkFile } | null>(null);

  useEffect(() => {
    controller.current?.abort(); inFlight.current = false; savedResult.current = null;
    setSource(''); setResult(null); setReady(false); setBusy(false); setApplying(false); setAttempt(0); setError(''); setZoom(false); setStage('Preparing your artwork…');
    setRetryPending(false); setRetryAt(0); setRetrySeconds(0);
    preparedIdentity.current = ''; autoStartedIdentity.current = '';
  }, [identity]);
  useEffect(() => () => controller.current?.abort(), []);

  useEffect(() => {
    const update = () => setRetrySeconds(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    update();
    if (!retryAt) return;
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

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
      preparedIdentity.current = currentIdentity;
      setReady(true);
    }).catch(reason => { if (!cancelled) setError(reason.message || 'AI fit could not be opened.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // Refresh on opening or a source/size change, including an explicit retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, identity, readinessAttempt]);

  async function generate(newVersion = false) {
    if (!ready || !source || inFlight.current || applying || retryAt > Date.now()) return;
    const requestIdentity = identity;
    inFlight.current = true; setBusy(true); setError('');
    const nextAttempt = newVersion ? attempt + 1 : attempt;
    if (newVersion) setAttempt(nextAttempt);
    controller.current?.abort();
    const activeController = new AbortController(); controller.current = activeController;
    try {
      logUx('ai_fit_start', { widthIn, heightIn });
      const response = await runBackgroundJob('/.netlify/functions/ai-designer-fit', {
        sourceImage: source, widthIn, heightIn, productType, attempt: nextAttempt,
      }, activeController.signal, 'Creating your fitted layout…', message => {
        if (!activeController.signal.aborted && requestIdentity === identityRef.current) setStage(message);
      }, undefined, undefined, requestIdentity);
      if (activeController.signal.aborted || requestIdentity !== identityRef.current) return;
      if (Math.abs(response.fit?.widthIn-widthIn)>.001 || Math.abs(response.fit?.heightIn-heightIn)>.001
        || (productType.startsWith('specialty:')&&response.fit?.productType!==productType)) {
        throw new Error('The fitted result does not match your selected product and size. Your original is unchanged.');
      }
      if (!canApplyArtworkFit(response.fit)) throw new Error('No fitted image was returned.');
      setResult(response.fit);
      savedResult.current = null; setRetryPending(false); setRetryAt(0);
      logUx('ai_fit_complete', { widthIn, heightIn, checksPassed: response.fit.verification?.passed });
    } catch (reason) {
      if (!activeController.signal.aborted && requestIdentity === identityRef.current) {
        setError(reason instanceof Error ? reason.message : 'AI fit could not finish. Your original is unchanged.');
        setRetryPending(true);
        if (reason instanceof AIRequestRateLimitError) { setRetryAt(reason.retryAt); setRetrySeconds(Math.max(0, Math.ceil((reason.retryAt - Date.now()) / 1000))); }
        logUx('ai_fit_error', { widthIn, heightIn });
      }
    } finally {
      if (controller.current === activeController) { inFlight.current = false; setBusy(false); }
    }
  }

  // The initial Fit click starts the work. Reopening and rerendering must not
  // submit another paid request, and a size change must use its own source.
  useEffect(() => {
    if (!open || !ready || !source || error || result || preparedIdentity.current !== identity
      || autoStartedIdentity.current === identity || inFlight.current) return;
    autoStartedIdentity.current = identity;
    void generate();
    // generate reads the current prepared source and request identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ready, source, identity, result, error]);

  async function apply() {
    if (!canApplyArtworkFit(result) || applying || inFlight.current) return;
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
  const working = loading || busy || (!result && !error);
  useEffect(() => {
    setWaitMessageIndex(0);
    if (!open || !working) return;
    const timer = window.setInterval(() => setWaitMessageIndex(value => (value + 1) % 3), 15000);
    return () => window.clearInterval(timer);
  }, [open, working, identity]);
  const waitMessage = [
    'Your original artwork stays safe while we work.',
    'You’ll be able to review and approve the finished preview.',
    'Thanks for your patience — some designs take a little longer.',
  ][waitMessageIndex];
  return <>
    <Dialog open={open && (working || canApply || Boolean(error))} onOpenChange={value => { if (!applying) onOpenChange(value); }}>
      <DialogContent className={`max-h-[94dvh] w-[calc(100%_-_1rem)] overflow-y-auto rounded-2xl p-5 sm:p-7 ${working ? 'sm:max-w-md' : 'sm:max-w-3xl'}`} onInteractOutside={event => { if (working || applying) event.preventDefault(); }}>
        <DialogHeader className={working ? 'items-center text-center sm:text-center' : undefined}>
          {working && <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-orange-50"><Loader2 className="h-8 w-8 animate-spin text-orange-600" aria-hidden="true" /></div>}
          <DialogTitle className={`text-xl font-bold text-slate-900 ${working ? '' : 'pr-7'}`}>{working ? 'Fitting your design…' : canApply ? 'Approve your fitted design' : 'Fit your design'}</DialogTitle>
          <DialogDescription className={working ? 'pt-2 text-base leading-relaxed text-slate-600' : 'sr-only'}>{working ? 'This can take a few minutes. Please keep this window open.' : `Review the fitted preview at ${widthIn} by ${heightIn} inches and approve your design.`}</DialogDescription>
        </DialogHeader>
        {working && <div role="status" aria-live="polite" aria-atomic="true" className="rounded-xl bg-slate-50 px-4 py-5 text-center">
          <p className="text-base font-semibold text-slate-900">{loading ? 'Preparing your artwork…' : stage}</p>
          <p className="mt-3 min-h-10 text-sm leading-relaxed text-slate-600">{waitMessage}</p>
        </div>}
        {!working && canApply && <div className="flex items-center justify-center rounded-xl bg-slate-100 p-3">
          <div className="relative w-full overflow-hidden bg-white shadow-sm" style={{ aspectRatio: `${widthIn} / ${heightIn}`, maxHeight: '65dvh', maxWidth: `calc(65dvh * ${widthIn / heightIn})` }}>
            <button type="button" onClick={() => setZoom(true)} aria-label="Enlarge fitted design" className="block h-full w-full"><img src={proposed} alt="Your fitted design" className="h-full w-full object-contain" /></button>
            {productContext.template && <SpecialtyTemplateGuide template={productContext.template} />}
          </div>
        </div>}
        {/* Technical details stay in diagnostics. A failed save never pretends
            that approval succeeded or replaces the customer's original. */}
        {!working && error && <p role="status" className="text-sm text-slate-600">{canApply ? 'Your preview is ready. Tap Approve design to finish.' : 'Your original design is saved. Tap Try again to continue.'}</p>}
        {!working && <div className="flex flex-wrap justify-end gap-2">
          {canApply ? <button type="button" disabled={applying} onClick={() => void apply()} className="min-h-11 rounded-lg bg-orange-600 px-6 py-3 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50">{applying ? 'Saving your design…' : 'Approve design'}</button>
            : <button type="button" disabled={loading || retrySeconds > 0} onClick={() => { if (!ready) setReadinessAttempt(value => value + 1); else void generate(!retryPending); }} className="min-h-11 rounded-lg bg-orange-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-50">{retrySeconds > 0 ? 'Please wait…' : 'Try again'}</button>}
        </div>}
        <Dialog open={zoom} onOpenChange={setZoom}><DialogContent className="max-h-[94dvh] w-[98vw] max-w-7xl overflow-auto p-3"><DialogTitle>Your fitted design</DialogTitle><DialogDescription className="sr-only">Enlarged preview of your fitted design.</DialogDescription><img src={proposed} alt="Full fitted artwork for detailed review" className="h-auto w-full" /></DialogContent></Dialog>
      </DialogContent>
    </Dialog>
  </>;
}
