import { useEffect } from 'react';

interface ScrollLockSnapshot {
  scrollY: number;
  html: {
    overflow: string;
    overscrollBehavior: string;
  };
  body: {
    overflow: string;
    overscrollBehavior: string;
    position: string;
    top: string;
    left: string;
    right: string;
    width: string;
    paddingRight: string;
  };
}

let activeLocks = 0;
let snapshot: ScrollLockSnapshot | null = null;

function applyDocumentScrollLock() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const html = document.documentElement;
  const body = document.body;
  const scrollY = window.scrollY;
  const scrollbarWidth = Math.max(0, window.innerWidth - html.clientWidth);

  snapshot = {
    scrollY,
    html: {
      overflow: html.style.overflow,
      overscrollBehavior: html.style.overscrollBehavior,
    },
    body: {
      overflow: body.style.overflow,
      overscrollBehavior: body.style.overscrollBehavior,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      paddingRight: body.style.paddingRight,
    },
  };

  html.style.overflow = 'hidden';
  html.style.overscrollBehavior = 'none';
  body.style.overflow = 'hidden';
  body.style.overscrollBehavior = 'none';
  body.style.position = 'fixed';
  body.style.top = `-${scrollY}px`;
  body.style.left = '0';
  body.style.right = '0';
  body.style.width = '100%';

  if (scrollbarWidth > 0) {
    const currentPadding = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;
    body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
  }
}

function releaseDocumentScrollLock() {
  if (!snapshot || typeof window === 'undefined' || typeof document === 'undefined') return;

  const saved = snapshot;
  const html = document.documentElement;
  const body = document.body;

  html.style.overflow = saved.html.overflow;
  html.style.overscrollBehavior = saved.html.overscrollBehavior;
  body.style.overflow = saved.body.overflow;
  body.style.overscrollBehavior = saved.body.overscrollBehavior;
  body.style.position = saved.body.position;
  body.style.top = saved.body.top;
  body.style.left = saved.body.left;
  body.style.right = saved.body.right;
  body.style.width = saved.body.width;
  body.style.paddingRight = saved.body.paddingRight;

  snapshot = null;
  window.scrollTo({ top: saved.scrollY, left: 0, behavior: 'auto' });
}

/**
 * Locks the root document while preserving the exact scroll position.
 * The module-level reference count prevents nested sheets and dialogs from
 * unlocking the page until the final active overlay closes.
 */
export function useDocumentScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked || typeof document === 'undefined') return;

    activeLocks += 1;
    if (activeLocks === 1) applyDocumentScrollLock();

    return () => {
      activeLocks = Math.max(0, activeLocks - 1);
      if (activeLocks === 0) releaseDocumentScrollLock();
    };
  }, [locked]);
}

