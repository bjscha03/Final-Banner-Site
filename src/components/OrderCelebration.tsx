import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// This component is mounted only in PaymentSuccess's server-verified branch.
// The isolated artwork cannot change checkout state, pricing, or receipt CSS.
export default function OrderCelebration({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const dismiss = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const key = `bof:celebration:${orderId}`;
    // Reduced motion users go directly to the existing confirmation.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    try { if (sessionStorage.getItem(key)) return; } catch { /* Storage is optional. */ }
    // Defer the claim so React StrictMode's setup/cleanup does not consume it.
    const start = window.setTimeout(() => {
      try { sessionStorage.setItem(key, '1'); } catch { /* Still show the receipt. */ }
      setOpen(true);
    }, 0);
    return () => window.clearTimeout(start);
  }, [orderId]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const root = document.getElementById('root');
    const previousInert = root?.inert ?? false;
    if (root) root.inert = true;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    // Parent watchdog works even if the artwork fails to load or execute.
    const timeout = window.setTimeout(dismiss, 7500);
    const message = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.source === frame.current?.contentWindow && event.data?.type === 'bof-celebration-done') dismiss();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
      if (event.key === 'Tab') { event.preventDefault(); closeButton.current?.focus(); }
    };
    const visibility = () => { if (document.hidden) dismiss(); };
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    motion.addEventListener('change', dismiss);
    window.addEventListener('message', message);
    document.addEventListener('keydown', keydown);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.clearTimeout(timeout);
      motion.removeEventListener('change', dismiss);
      window.removeEventListener('message', message);
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('visibilitychange', visibility);
      document.body.style.overflow = previousOverflow;
      if (root) root.inert = previousInert;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open, dismiss]);

  if (!open) return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Order confirmed" style={{ position: 'fixed', inset: 0, zIndex: 2147483000, background: '#030919', overflow: 'hidden' }}>
      <iframe ref={frame} src="/order-celebration.html?embedded=1" title="Order confirmation fireworks" tabIndex={-1} aria-hidden="true"
        style={{ width: '100%', height: '100%', border: 0, pointerEvents: 'none' }}
        onError={dismiss}
        onLoad={() => frame.current?.contentWindow?.postMessage({ type: 'bof-celebration-start' }, window.location.origin)} />
      <div style={{ position: 'absolute', top: 'max(20px, env(safe-area-inset-top))', left: 20, color: '#dbe7fb', font: '600 13px Arial, sans-serif' }} role="status">Payment confirmed</div>
      <button ref={closeButton} type="button" onClick={dismiss} style={{ position: 'absolute', right: 20, bottom: 'max(24px, env(safe-area-inset-bottom))', minHeight: 48, padding: '12px 20px', border: '1px solid #ffffff66', borderRadius: 30, background: '#0b1733', color: '#fff', font: '600 14px Arial, sans-serif', cursor: 'pointer' }}>View confirmation →</button>
    </div>, document.body,
  );
}
