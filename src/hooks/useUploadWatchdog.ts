import { useEffect, useRef } from 'react';

export const UPLOAD_IDLE_LIMIT_MS = 45_000;
export const UPLOAD_TOTAL_LIMIT_MS = 180_000;
export const LARGE_UPLOAD_TOTAL_LIMIT_MS = 30 * 60_000;
export const LARGE_UPLOAD_IDLE_LIMIT_MS = 120_000;

/** Covers preview preparation, storage, response parsing, and transport retries. */
export function useUploadWatchdog(active: boolean, progress: number, onTimeout: () => void, fileBytes = 0) {
  const large = fileBytes > 20 * 1024 * 1024;
  const totalLimit = large ? LARGE_UPLOAD_TOTAL_LIMIT_MS : UPLOAD_TOTAL_LIMIT_MS;
  const idleLimit = large ? LARGE_UPLOAD_IDLE_LIMIT_MS : UPLOAD_IDLE_LIMIT_MS;
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
    }, totalLimit);
    return () => window.clearTimeout(timer);
  }, [active, totalLimit]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => {
      if (fired.current) return;
      fired.current = true;
      timeoutRef.current();
    }, idleLimit);
    return () => window.clearTimeout(timer);
  }, [active, progress, idleLimit]);
}
