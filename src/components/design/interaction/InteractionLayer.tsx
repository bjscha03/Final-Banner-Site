import React from 'react';

/**
 * Thin wrapper that owns canvas-scoped touch behaviour:
 *   - touch-action: none  (we own the gesture; no native pinch-zoom / scroll fight)
 *   - user-select: none   (no text selection while dragging)
 *   - -webkit-touch-callout: none (no iOS long-press menu)
 *
 * Also blocks Safari's `gesturestart`/`gesturechange`/`gestureend` events,
 * which fire ALONGSIDE pointer events on iOS and would otherwise trigger
 * the browser's own page-zoom mid-pinch.
 *
 * Apply ONLY to the canvas interaction layer — never to <body> or the page,
 * so users can still scroll the rest of the page normally.
 */
export interface InteractionLayerProps
  extends React.HTMLAttributes<HTMLDivElement> {
  as?: 'div' | 'section';
  children?: React.ReactNode;
}

const InteractionLayer = React.forwardRef<HTMLDivElement, InteractionLayerProps>(
  function InteractionLayer({ as = 'div', className, children, ...rest }, ref) {
    const Comp: any = as;
    React.useEffect(() => {
      const el = (typeof ref === 'function' ? null : ref?.current) as
        | HTMLElement
        | null;
      if (!el) return;
      // Safari-only gesture events. preventDefault stops native pinch-zoom.
      const block = (ev: Event) => ev.preventDefault();
      el.addEventListener('gesturestart', block as EventListener);
      el.addEventListener('gesturechange', block as EventListener);
      el.addEventListener('gestureend', block as EventListener);
      return () => {
        el.removeEventListener('gesturestart', block as EventListener);
        el.removeEventListener('gesturechange', block as EventListener);
        el.removeEventListener('gestureend', block as EventListener);
      };
    }, [ref]);
    return (
      <Comp
        ref={ref}
        className={`canvas-interaction-layer${className ? ` ${className}` : ''}`}
        {...rest}
      >
        {children}
      </Comp>
    );
  }
);

export default InteractionLayer;
