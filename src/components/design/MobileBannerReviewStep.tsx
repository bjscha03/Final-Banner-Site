import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, Loader2, Pencil, ShoppingCart, RefreshCw } from 'lucide-react';
import MobileBannerSteps from './MobileBannerSteps';
import type { MobileFinishingStepProps } from './MobileFinishingStep';

/** The live editor remains mounted under this step and owns the checkout render. */
export default function MobileBannerReviewStep({ open, onBack, children, preview, summary, price,
  description, ready, busy, editing, cartItemCount, onViewCart, onCheckout, onAddAnother,
  finishingSummary, onReplaceArtwork }: MobileFinishingStepProps) {
  return <Dialog.Root open={open} onOpenChange={next => { if (!next && !busy) onBack(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[60] bg-slate-950/40" />
      <Dialog.Content data-testid="mobile-finishing-step" className="fixed inset-0 z-[60] flex h-[100dvh] flex-col bg-white text-[#061A31] focus:outline-none"
        onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}
        onPointerDownOutside={event => event.preventDefault()}
        onCloseAutoFocus={event => { event.preventDefault(); document.querySelector<HTMLButtonElement>('[data-banner-primary-action]')?.focus({ preventScroll: true }); }}>
        <header className="shrink-0 bg-[#061A31] px-4 py-2">
          <div className="mx-auto flex max-w-xl items-center justify-between">
            <img src="/images/homepage/header-logo-reverse.png" alt="Banners On The Fly" width="248" height="70" className="h-8 w-auto" />
            <button type="button" aria-label={`Shopping cart (${cartItemCount})`} disabled={busy} onClick={onViewCart} className="relative flex h-10 w-10 items-center justify-center text-white disabled:opacity-50"><ShoppingCart className="h-5 w-5" />{cartItemCount > 0 && <span className="absolute right-0 top-0 rounded-full bg-orange-600 px-1.5 text-[10px]">{cartItemCount}</span>}</button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5">
          <div className="mx-auto max-w-xl">
            <MobileBannerSteps current={3} onArtwork={busy ? undefined : onBack} />
            <Dialog.Title className="mb-2 text-[clamp(1.4rem,6vw,1.9rem)] font-extrabold leading-tight tracking-tight">Looks good? Make it real.</Dialog.Title>
            <Dialog.Description className="mb-3 text-xs text-slate-600">{description}</Dialog.Description>
            {preview}
            <div className="my-1 flex items-center justify-around gap-2 text-sm text-[#18448D]">
              <button type="button" disabled={busy} onClick={onBack} className="inline-flex min-h-11 items-center gap-2 underline"><Pencil className="h-4 w-4" />Edit design</button>
              {onReplaceArtwork && <label className={`inline-flex min-h-11 items-center gap-2 underline ${busy ? 'opacity-50' : 'cursor-pointer'}`}><RefreshCw className="h-4 w-4" />Replace artwork<input type="file" aria-label="Replace artwork from review" accept="image/png,image/jpeg,application/pdf,.png,.jpg,.jpeg,.pdf" disabled={busy} className="sr-only" onChange={event => { const file = event.target.files?.[0]; if (file) onReplaceArtwork(file); event.target.value = ''; }} /></label>}
            </div>
            <details className="mb-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="review-finishing-options">
              <summary className="cursor-pointer list-none"><span className="block text-base font-bold">Finishing</span><span className="mt-1 block text-xs leading-5 text-slate-600">{finishingSummary}</span><span className="mt-1 block text-right text-xs font-semibold text-[#18448D] underline">Change finishing</span></summary>
              <div className="mt-4">{children}</div>
            </details>
            {summary}
            <button type="button" onClick={onAddAnother} disabled={!ready || busy} className="mt-2 min-h-11 w-full text-sm font-semibold text-[#18448D] underline disabled:text-slate-400">{editing ? 'Save & design another' : 'Add & design another'}</button>
          </div>
        </div>
        <footer className="shrink-0 border-t border-slate-200 bg-white px-4 pt-2 shadow-[0_-4px_20px_rgba(15,23,42,0.06)]" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
            <div>{price}<p className="text-[10px] text-slate-500">Before tax</p></div>
            <button type="button" onClick={onCheckout} disabled={!ready || busy} className="inline-flex min-h-12 max-w-[60%] items-center justify-center gap-2 rounded-xl bg-[#F56600] px-5 py-3 text-base font-bold text-white disabled:bg-slate-300 disabled:text-slate-600">
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : ready ? <>Checkout <ArrowRight className="h-4 w-4" /></> : 'Choose finishing'}
            </button>
          </div>
        </footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
