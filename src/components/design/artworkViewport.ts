import { useLayoutEffect, type RefObject } from 'react';

/** Browser chrome, zoom and the live footer all reduce the usable page area. */
export function visibleArtworkBounds() {
  const viewport = window.visualViewport;
  let top = viewport?.offsetTop ?? 0;
  let bottom = Math.min(window.innerHeight, top + (viewport?.height ?? window.innerHeight));
  const header = document.querySelector<HTMLElement>('[data-site-header]')?.getBoundingClientRect();
  const footer = document.querySelector<HTMLElement>('[data-testid="mobile-subtotal-bar"]')?.getBoundingClientRect();
  if (header && header.height && header.bottom > top) top = Math.max(top, header.bottom);
  if (footer && footer.height && footer.top < bottom) bottom = Math.min(bottom, footer.top);
  return { top: top + 8, bottom: bottom - 8 };
}

export function revealArtworkElement(element: HTMLElement | null) {
  if (!element || document.querySelector('[role="dialog"][data-state="open"]')) return;
  const { top, bottom } = visibleArtworkBounds();
  const rect = element.getBoundingClientRect();
  const targetTop = top + Math.max(0, (bottom - top - rect.height) / 2);
  const delta = rect.top - targetTop;
  if (Math.abs(delta) > 1) window.scrollTo({ top: Math.max(0, window.scrollY + delta), behavior: 'instant' });
}

/** Fit the entire canvas/rulers/selection toolbar, then reveal it after upload.
 * Resizing never changes the normalized print composition or follows scrolling.
 */
export function useArtworkWorkspaceViewport(
  ref: RefObject<HTMLDivElement>, artworkIdentity: string | undefined, aspect: number, desktopLayout: boolean,
) {
  useLayoutEffect(() => {
    const workspace = ref.current;
    if (!workspace || !artworkIdentity || !(aspect > 0)) return;
    let frame = 0;
    let firstReveal = true;
    let following = true;
    const updateLayout = () => {
      const { top, bottom } = visibleArtworkBounds();
      const before = workspace.getBoundingClientRect();
      const wasVisible = before.bottom > top && before.top < bottom;
      const css = getComputedStyle(workspace);
      // Include both ruler gutters, workspace padding and the reserved toolbar.
      const verticalChrome = parseFloat(css.paddingTop) + parseFloat(css.paddingBottom)
        + parseFloat(css.borderTopWidth) + parseFloat(css.borderBottomWidth) + 28;
      const canvasHeight = Math.max(24, bottom - top - verticalChrome);
      const rulerWidth = Math.floor(canvasHeight * aspect + 28);
      workspace.style.setProperty('--artwork-viewport-width', `${rulerWidth}px`);
      if (firstReveal || (following && wasVisible)) revealArtworkElement(workspace);
      firstReveal = false;
    };
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateLayout);
    };
    // Deliberate page navigation must not be pulled back by upload completion.
    const stopFollowing = () => { following = false; };
    const onTouch = (event: TouchEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-testid="artwork-canvas"]')) stopFollowing();
    };
    const onKey = (event: KeyboardEvent) => {
      if (['PageUp', 'PageDown', 'Home', 'End', 'Tab'].includes(event.key)) stopFollowing();
    };
    let viewportWidth = window.innerWidth;
    const onViewportResize = () => {
      // Address-bar collapse during a swipe is a resize too. Only a width
      // change (rotation/resizing the window) re-enables automatic alignment.
      if (window.innerWidth !== viewportWidth) following = true;
      viewportWidth = window.innerWidth;
      update();
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(workspace);
    for (const element of document.querySelectorAll('[data-site-header], [data-testid="mobile-subtotal-bar"]')) observer?.observe(element);
    window.addEventListener('resize', onViewportResize);
    window.visualViewport?.addEventListener('resize', onViewportResize);
    window.addEventListener('wheel', stopFollowing, { passive: true });
    window.addEventListener('touchstart', onTouch, { passive: true });
    window.addEventListener('keydown', onKey);
    // Apply the fitted width before the new image can paint or the editor can
    // measure it. This also avoids a full-size flash when undoing deletion.
    updateLayout();
    return () => {
      observer?.disconnect();
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', onViewportResize);
      window.visualViewport?.removeEventListener('resize', onViewportResize);
      window.removeEventListener('wheel', stopFollowing);
      window.removeEventListener('touchstart', onTouch);
      window.removeEventListener('keydown', onKey);
    };
  }, [ref, artworkIdentity, aspect, desktopLayout]);
}
