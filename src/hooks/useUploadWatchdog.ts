import { useEffect, useRef } from 'react';

export const UPLOAD_IDLE_LIMIT_MS = 45_000;
export const UPLOAD_TOTAL_LIMIT_MS = 180_000;

/** Covers preview preparation, storage, response parsing, and transport retries. */
export function useUploadWatchdog(active: boolean, progress: number, onTimeout: () => void) {
  const timeoutRef = useRef(onTimeout);
  timeoutRef.current = onTimeout;
  const fired = useRef(false);

  useEffect(() => {
    if (!active) return;
    fired.current = false;
    const timer = window.setTimeout(() => {
      if (fired.current) return;
      fired.current = true;
      timeoutRef.current();
    }, UPLOAD_TOTAL_LIMIT_MS);
    return () => window.clearTimeout(timer);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => {
      if (fired.current) return;
      fired.current = true;
      timeoutRef.current();
    }, UPLOAD_IDLE_LIMIT_MS);
    return () => window.clearTimeout(timer);
  }, [active, progress]);
}
