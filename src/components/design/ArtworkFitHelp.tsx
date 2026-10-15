import { useCallback, useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, Sparkles, X } from 'lucide-react';

export type ArtworkFitAssistance = {
  enabled: boolean;
  fitDialogOpen: boolean;
  onFit: () => void;
  widthIn: number;
  heightIn: number;
  productLabel: string;
};

const STORAGE_KEY = 'bof:artwork-fit-help:v1';
const seenDesigns = new Set<string>();
const HELP_DELAY_MS = 1600;

function wasShown(key: string) {
  if (seenDesigns.has(key)) return true;
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(saved)) saved.filter(item => typeof item === 'string').forEach(item => seenDesigns.add(item));
  } catch { /* Private browsing/storage restrictions must not affect editing. */ }
  return seenDesigns.has(key);
}

function remember(key: string) {
  seenDesigns.add(key);
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...seenDesigns].slice(-100))); } catch { /* Session-memory fallback. */ }
}

/** Count completed customer actions, never image loads, viewport changes or pointer frames. */
export function useArtworkFitHelp(key: string, assistance: ArtworkFitAssistance | undefined, canShow: () => boolean) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const latest = useRef({ assistance, canShow });
  latest.current = { assistance, canShow };
  const attempts = useRef<number[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPending = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => {
    attempts.current = [];
    setOpenKey(null);
    return cancelPending;
  }, [key, cancelPending]);

  useEffect(() => {
    if (assistance?.fitDialogOpen) remember(key);
    if (!assistance?.enabled || assistance.fitDialogOpen) {
      cancelPending();
      setOpenKey(null);
    }
  }, [key, assistance?.enabled, assistance?.fitDialogOpen, cancelPending]);

  const recordAdjustment = useCallback((needsHelp: boolean) => {
    cancelPending();
    const { assistance: current } = latest.current;
    if (!current?.enabled || current.fitDialogOpen || wasShown(key)) return;
    if (!needsHelp) { attempts.current = []; return; }
    const now = Date.now();
    attempts.current = attempts.current.filter(time => now - time < 120_000);
    // Holding an arrow key is one adjustment, not dozens of failed attempts.
    if (!attempts.current.length || now - attempts.current.at(-1)! >= 350) attempts.current.push(now);
    if (attempts.current.length < 3) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      const current = latest.current;
      if (!current.assistance?.enabled || current.assistance.fitDialogOpen || wasShown(key) || !current.canShow()) return;
      remember(key); // Shared by the inline and enlarged editors, including remounts.
      setOpenKey(key);
    }, HELP_DELAY_MS);
  }, [key, cancelPending]);

  const dismiss = useCallback(() => { cancelPending(); remember(key); setOpenKey(null); }, [key, cancelPending]);
  return { open: openKey === key && Boolean(assistance?.enabled) && !assistance?.fitDialogOpen, dismiss, recordAdjustment, cancelPending };
}

export default function ArtworkFitHelp({ open, onDismiss, assistance, imageSrc, onReturnFocus }: {
  open: boolean;
  onDismiss: () => void;
  assistance?: ArtworkFitAssistance;
  imageSrc: string;
  onReturnFocus: () => void;
}) {
  const openingFitter = useRef(false);
  useEffect(() => { if (open) openingFitter.current = false; }, [open]);
  if (!assistance) return null;
  const { widthIn, heightIn, productLabel } = assistance;
  return <Dialog.Root open={open} onOpenChange={next => { if (!next) onDismiss(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[10001] bg-black/35 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none" />
      <Dialog.Content data-testid="artwork-fit-help" className="fixed inset-x-0 bottom-0 z-[10002] max-h-[90dvh] overflow-y-auto rounded-t-3xl bg-white px-5 pt-4 shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-8 motion-reduce:animate-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[440px] sm:max-w-[calc(100vw-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:px-6" style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
        onCloseAutoFocus={event => { event.preventDefault(); if (!openingFitter.current) onReturnFocus(); }}>
        <div aria-hidden="true" className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-300 sm:hidden" />
        <div className="mb-4 flex items-center justify-between gap-4">
          <img src="/images/header-logo.png" alt="Banners On The Fly" width={142} height={40} className="h-10 w-auto max-w-[160px] object-contain" />
          <Dialog.Close aria-label="Close fitting help" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#061A31] hover:bg-orange-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600"><X size={26} /></Dialog.Close>
        </div>
        <Dialog.Title className="pr-2 text-[26px] font-bold leading-tight tracking-tight text-[#061A31]">Having difficulty fitting your artwork?</Dialog.Title>
        <Dialog.Description className="mt-2 text-sm leading-relaxed text-slate-600">Let AI help fit your artwork to your {productLabel}.</Dialog.Description>
        <div className="my-4 flex items-center gap-3" aria-hidden="true">
          <div className="min-w-0 flex-1"><p className="mb-1.5 text-center text-xs font-medium text-slate-600">Your artwork</p><div className="flex h-20 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-1.5"><img src={imageSrc} alt="" className="max-h-full max-w-full object-contain" /></div></div>
          <ArrowRight size={20} className="mt-5 shrink-0 text-slate-400" />
          <div className="min-w-0 flex-1"><p className="mb-1.5 text-center text-xs font-medium text-slate-600">{widthIn}″ × {heightIn}″</p><div className="flex h-20 items-center justify-center rounded-lg border border-orange-200 bg-orange-50 p-2"><div className="flex max-h-full max-w-full items-center justify-center rounded border border-dashed border-orange-400 bg-white" style={{ aspectRatio: `${widthIn} / ${heightIn}`, width: Math.min(220, 62 * widthIn / heightIn) }}><Sparkles className="h-6 w-6 text-orange-600" /></div></div></div>
        </div>
        <button type="button" onClick={() => { openingFitter.current = true; onDismiss(); assistance.onFit(); }} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-3 text-lg font-bold text-white shadow-sm hover:bg-orange-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"><Sparkles size={22} aria-hidden="true" />Fit with AI</button>
        <p className="mt-2 text-center text-xs leading-relaxed text-slate-500">Preview the result before you use it.</p>
        <Dialog.Close className="mt-3 min-h-11 w-full rounded-xl border border-slate-300 px-4 py-2 font-semibold text-orange-700 hover:bg-orange-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600">Keep editing</Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
