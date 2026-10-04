import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';

interface MobileFinishingStepProps {
  open: boolean;
  onBack: () => void;
  children: ReactNode;
  summary: ReactNode;
  price: ReactNode;
  promotionNote?: ReactNode;
  description: string;
  ready: boolean;
  busy: boolean;
  editing: boolean;
  cartItemCount: number;
  onViewCart: () => void;
  onCheckout: () => void;
  onAddAnother: () => void;
}

/** A full-screen step: the artwork editor stays mounted behind it so its
 * normalized placement and final render remain intact when saving the item. */
export default function MobileFinishingStep({ open, onBack, children, summary,
  price, promotionNote, description, ready, busy, editing, cartItemCount,
  onViewCart, onCheckout, onAddAnother }: MobileFinishingStepProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next && !busy) onBack(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-slate-950/40" />
        <Dialog.Content
          data-testid="mobile-finishing-step"
          className="fixed inset-0 z-[60] flex h-[100dvh] flex-col bg-slate-50 text-[#0B1F3A] focus:outline-none"
          onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}
          onPointerDownOutside={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            document.querySelector<HTMLButtonElement>('[data-banner-primary-action]')?.focus({ preventScroll: true });
          }}
        >
          <header className="shrink-0 border-b border-slate-200 bg-white px-4 pb-4 pt-[max(0.5rem,env(safe-area-inset-top))]">
            <div className="mx-auto max-w-xl">
              <button type="button" disabled={busy} onClick={onBack} className="-ml-2 flex min-h-11 items-center gap-2 px-2 text-sm font-semibold disabled:opacity-50">
                <ArrowLeft className="h-4 w-4" /> Back to design
              </button>
              <p className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
                <Check className="h-3.5 w-3.5 text-emerald-600" /> Design <span aria-hidden="true">→</span>
                <span className="font-bold text-orange-700" aria-current="step">2 Finishing</span><span aria-hidden="true">→</span> 3 Checkout
              </p>
              <Dialog.Title className="text-2xl font-bold">How will you hang it?</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-slate-600">{description}</Dialog.Description>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            <div className="mx-auto max-w-xl space-y-4">
              {children}
              <details className="rounded-xl border border-slate-200 bg-white p-4">
                <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Price &amp; delivery details</summary>
                <div className="space-y-4 pt-2">{summary}</div>
              </details>
            </div>
          </div>
          <footer className="shrink-0 border-t border-slate-200 bg-white px-4 pt-3 shadow-[0_-4px_20px_rgba(15,23,42,0.06)]" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
            <div className="mx-auto max-w-xl">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div><p className="text-xs text-slate-500">This banner · Before tax</p>{price}</div>
                <button type="button" disabled={busy} onClick={onViewCart} className="min-h-11 px-2 text-sm font-semibold underline underline-offset-4 disabled:opacity-50">View cart ({cartItemCount})</button>
              </div>
              {promotionNote && <p className="mb-2 text-xs font-semibold text-emerald-700">{promotionNote}</p>}
              <button type="button" onClick={onCheckout} disabled={!ready || busy} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FF6A00] px-4 py-3 text-base font-bold text-[#061A31] disabled:bg-slate-200 disabled:text-slate-500">
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving your design…</> : ready ? <>Continue to checkout <ArrowRight className="h-4 w-4" /></> : 'Choose a finishing option'}
              </button>
              <button type="button" onClick={onAddAnother} disabled={!ready || busy} className="mt-1 min-h-11 w-full px-4 text-sm font-semibold text-[#18448D] disabled:text-slate-400">{editing ? 'Save & design another' : 'Add & design another'}</button>
            </div>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
