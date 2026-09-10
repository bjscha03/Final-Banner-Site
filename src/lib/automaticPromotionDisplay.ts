import { LARGE_BANNER_PROMOTION_LABEL } from './largeBannerPromotion';

export interface AutomaticPromotionDisplaySnapshot {
  active: boolean;
  label: string;
  originalSubtotalCents: number;
  discountedSubtotalCents: number;
}

const EMPTY_SNAPSHOT: AutomaticPromotionDisplaySnapshot = Object.freeze({
  active: false,
  label: LARGE_BANNER_PROMOTION_LABEL,
  originalSubtotalCents: 0,
  discountedSubtotalCents: 0,
});

let snapshot: AutomaticPromotionDisplaySnapshot = EMPTY_SNAPSHOT;
const listeners = new Set<() => void>();

function normalizedCents(value: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : 0;
}

export function setAutomaticPromotionDisplay(
  next: Omit<AutomaticPromotionDisplaySnapshot, 'active' | 'label'> | null,
): void {
  const originalSubtotalCents = normalizedCents(next?.originalSubtotalCents || 0);
  const discountedSubtotalCents = normalizedCents(next?.discountedSubtotalCents || 0);
  const active = Boolean(
    next
    && originalSubtotalCents > discountedSubtotalCents
    && discountedSubtotalCents >= 0,
  );

  const nextSnapshot = active
    ? {
        active: true,
        label: LARGE_BANNER_PROMOTION_LABEL,
        originalSubtotalCents,
        discountedSubtotalCents,
      }
    : EMPTY_SNAPSHOT;

  if (
    snapshot.active === nextSnapshot.active
    && snapshot.label === nextSnapshot.label
    && snapshot.originalSubtotalCents === nextSnapshot.originalSubtotalCents
    && snapshot.discountedSubtotalCents === nextSnapshot.discountedSubtotalCents
  ) {
    return;
  }

  snapshot = nextSnapshot;
  listeners.forEach(listener => listener());
}

export function subscribeAutomaticPromotionDisplay(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAutomaticPromotionDisplaySnapshot(): AutomaticPromotionDisplaySnapshot {
  return snapshot;
}

export function getAutomaticPromotionDisplayServerSnapshot(): AutomaticPromotionDisplaySnapshot {
  return EMPTY_SNAPSHOT;
}
