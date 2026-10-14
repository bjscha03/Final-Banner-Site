import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, Loader2, Pencil, ShoppingCart, RefreshCw } from 'lucide-react';
import MobileBannerSteps from './MobileBannerSteps';
import ShippingBenefitBadge from '@/components/pricing/ShippingBenefitBadge';
import type { MobileFinishingStepProps } from './MobileFinishingStep';

/** The live editor remains mounted under this step and owns the checkout render. */
export default function MobileBannerReviewStep({ open, onBack, children, preview, summary, price,
  description, promotionNote, ready, busy, editing, cartItemCount, onViewCart, onCheckout, onAddAnother,
  onReplaceArtwork }: MobileFinishingStepProps) {
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
            <MobileBannerSteps current={2} onDesign={busy ? undefined : onBack} />
            <Dialog.Title className="mb-2 text-[clamp(1.4rem,6vw,1.9rem)] font-extrabold leading-tight tracking-tight">Choose your finishing</Dialog.Title>
            <Dialog.Description className="mb-3 text-xs text-slate-600">{description}</Dialog.Description>
            {preview}
            <div className="my-1 flex items-center justify-around gap-2 text-sm text-[#18448D]">
              <button type="button" disabled={busy} onClick={onBack} className="inline-flex min-h-11 items-center gap-2 underline"><Pencil className="h-4 w-4" />Edit design</button>
              {onReplaceArtwork && <label className={`inline-flex min-h-11 items-center gap-2 underline ${busy ? 'opacity-50' : 'cursor-pointer'}`}><RefreshCw className="h-4 w-4" />Replace artwork<input type="file" aria-label="Replace artwork from review" accept="image/png,image/jpeg,application/pdf,.png,.jpg,.jpeg,.pdf" disabled={busy} className="sr-only" onChange={event => { const file = event.target.files?.[0]; if (file) onReplaceArtwork(file); event.target.value = ''; }} /></label>}
            </div>
            <section aria-label="Finishing options" className="mb-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm" data-testid="review-finishing-options">
              {children}
            </section>
            {summary}
            <button type="button" onClick={onAddAnother} disabled={!ready || busy} className="mt-2 min-h-11 w-full text-sm font-semibold text-[#18448D] underline disabled:text-slate-400">{editing ? 'Save & design another' : 'Add & design another'}</button>
          </div>
        </div>
        <footer data-testid="finishing-subtotal-bar" className="banner-order-bar shrink-0 px-4 pt-2" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
            <div className="min-w-0">{price}<p className="text-[11px] leading-[14px] text-[#B8C8DC]">{promotionNote && <span>{promotionNote}<br /></span>}Before tax</p></div>
            <button type="button" onClick={onCheckout} disabled={!ready || busy} className="inline-flex min-h-12 max-w-[60%] items-center justify-center gap-2 rounded-xl bg-[#FF6A00] px-5 py-3 text-base font-bold text-white disabled:bg-slate-600 disabled:text-slate-200 focus-visible:ring-2 focus-visible:ring-white">
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : ready ? <>Checkout <ArrowRight className="h-4 w-4" /></> : 'Choose finishing'}
            </button>
          </div>
          <ShippingBenefitBadge variant="price" className="mx-auto mt-1.5 max-w-xl !text-xs !text-white [&>svg]:h-4 [&>svg]:w-4" />
        </footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
