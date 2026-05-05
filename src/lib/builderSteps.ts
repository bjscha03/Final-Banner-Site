/**
 * Pure step-machine for the mobile order builder sticky CTA + step
 * progress indicator on /design and /google-ads-banner.
 *
 * Goal: the CTA must always advance the user by exactly one step and
 * point at the next *incomplete* required choice. It must never jump
 * ahead to "Upload Artwork" before size/material/quantity are valid,
 * and it must never claim "Add to Cart" before artwork is uploaded.
 *
 * This module owns no React state and no side effects — both pages
 * compute a `BuilderStepState` from their existing local state and call
 * `getNextStep(state)` to render their sticky CTA and progress UI.
 *
 * Anchor IDs returned by `scrollTargetId` must match the `id` set on
 * the corresponding builder section. See:
 *   - `size-section`
 *   - `material-section`
 *   - `quantity-section`
 *   - `options-section`
 *   - `upload-section`
 */

export const BUILDER_STEPS = [
  'size',
  'material',
  'quantity',
  'options',
  'upload',
] as const;

export type BuilderStepKey = (typeof BUILDER_STEPS)[number];

export interface BuilderStepState {
  /** True until the user clicks "Start Order" / scrolls past hero. */
  showEntryCta: boolean;
  /** Pricing-relevant inputs. */
  widthIn: number | null | undefined;
  heightIn: number | null | undefined;
  material: string | null | undefined;
  quantity: number | null | undefined;
  /** Upload lifecycle. */
  isUploading: boolean;
  uploadError: string | null | undefined;
  hasUpload: boolean;
  /**
   * Optional override: yard-sign / car-magnet flows treat "options"
   * differently. When `optionsRequired` is false (default), the
   * options card is purely informational and never blocks the CTA.
   */
  optionsRequired?: boolean;
  /** When `optionsRequired` is true, set this to whether they're satisfied. */
  optionsValid?: boolean;
}

export interface BuilderCtaDescriptor {
  /** Which step the CTA is currently pointing at. */
  step: BuilderStepKey | 'entry' | 'add_to_cart' | 'uploading' | 'upload_error';
  /** Visible button label. */
  label: string;
  /** DOM `id` to scroll into view, or null if the CTA performs a non-scroll action. */
  scrollTargetId: string | null;
  /** True when the button must be disabled (e.g. uploading, missing prereqs). */
  disabled: boolean;
  /** True when an in-progress spinner should render and `aria-busy` should be set. */
  loading: boolean;
  /** Helper line shown under the CTA (e.g. why it's disabled). */
  helper: string | null;
}

export interface BuilderProgress {
  /** 1-indexed current step number. */
  current: number;
  /** Total number of steps shown in the progress indicator. */
  total: number;
  /** Human-readable label for the current step. */
  label: string;
  /** Per-step completion (parallel array to BUILDER_STEPS). */
  completed: Record<BuilderStepKey, boolean>;
}

const STEP_LABELS: Record<BuilderStepKey, string> = {
  size: 'Choose your size',
  material: 'Select material',
  quantity: 'Choose quantity',
  options: 'Choose options',
  upload: 'Upload artwork',
};

const STEP_ANCHORS: Record<BuilderStepKey, string> = {
  size: 'size-section',
  material: 'material-section',
  quantity: 'quantity-section',
  options: 'options-section',
  upload: 'upload-section',
};

function isSizeValid(state: BuilderStepState): boolean {
  return Boolean(state.widthIn && state.heightIn && state.widthIn > 0 && state.heightIn > 0);
}

function isMaterialValid(state: BuilderStepState): boolean {
  return Boolean(state.material);
}

function isQuantityValid(state: BuilderStepState): boolean {
  const q = state.quantity;
  return typeof q === 'number' && Number.isFinite(q) && q >= 1;
}

function isOptionsComplete(state: BuilderStepState): boolean {
  // When the options card is informational (default), it's always "complete"
  // for the purposes of advancing the CTA — a missing finishing selection
  // is handled by the upsell modal at Add-to-Cart time, not by blocking.
  if (!state.optionsRequired) return true;
  return Boolean(state.optionsValid);
}

/**
 * Compute the per-step completion bitmap used by the progress indicator.
 */
export function getProgress(state: BuilderStepState): BuilderProgress {
  const completed: Record<BuilderStepKey, boolean> = {
    size: isSizeValid(state),
    material: isMaterialValid(state),
    quantity: isQuantityValid(state),
    options: isOptionsComplete(state),
    upload: state.hasUpload,
  };
  // Current step = first incomplete step, or final step if all done.
  const idx = BUILDER_STEPS.findIndex(k => !completed[k]);
  const current = idx === -1 ? BUILDER_STEPS.length : idx + 1;
  const currentKey = BUILDER_STEPS[Math.min(current, BUILDER_STEPS.length) - 1];
  return {
    current,
    total: BUILDER_STEPS.length,
    label: STEP_LABELS[currentKey],
    completed,
  };
}

/**
 * Resolve the descriptor for the sticky CTA. One step at a time — the
 * label and scroll target always match exactly what the next missing
 * required choice is.
 *
 * The `add_to_cart` and `checkout` actions are not handled here because
 * they involve side-effectful callbacks owned by the page; the caller
 * inspects `descriptor.step === 'add_to_cart'` and wires its own
 * handler.
 */
export function getNextStep(state: BuilderStepState): BuilderCtaDescriptor {
  if (state.showEntryCta) {
    return {
      step: 'entry',
      label: 'Start Order',
      scrollTargetId: 'order-builder',
      disabled: false,
      loading: false,
      helper: null,
    };
  }

  if (state.isUploading) {
    return {
      step: 'uploading',
      label: 'Uploading…',
      scrollTargetId: null,
      disabled: true,
      loading: true,
      helper: 'Uploading your artwork — this can take a few seconds.',
    };
  }

  if (state.uploadError) {
    return {
      step: 'upload_error',
      label: 'Retry Upload',
      scrollTargetId: STEP_ANCHORS.upload,
      disabled: false,
      loading: false,
      helper: state.uploadError,
    };
  }

  if (!isSizeValid(state)) {
    return {
      step: 'size',
      label: 'Choose Size',
      scrollTargetId: STEP_ANCHORS.size,
      disabled: false,
      loading: false,
      helper: null,
    };
  }

  if (!isMaterialValid(state)) {
    return {
      step: 'material',
      label: 'Select Material',
      scrollTargetId: STEP_ANCHORS.material,
      disabled: false,
      loading: false,
      helper: null,
    };
  }

  if (!isQuantityValid(state)) {
    return {
      step: 'quantity',
      label: 'Choose Quantity',
      scrollTargetId: STEP_ANCHORS.quantity,
      disabled: false,
      loading: false,
      helper: null,
    };
  }

  if (state.optionsRequired && !isOptionsComplete(state)) {
    return {
      step: 'options',
      label: 'Choose Options',
      scrollTargetId: STEP_ANCHORS.options,
      disabled: false,
      loading: false,
      helper: null,
    };
  }

  if (!state.hasUpload) {
    return {
      step: 'upload',
      label: 'Upload Artwork',
      scrollTargetId: STEP_ANCHORS.upload,
      disabled: false,
      loading: false,
      helper: null,
    };
  }

  return {
    step: 'add_to_cart',
    label: 'Add to Cart',
    scrollTargetId: null,
    disabled: false,
    loading: false,
    helper: null,
  };
}

/**
 * Smooth-scroll a section into view by id. Mirrors the existing
 * scroll-to behaviour in Design.tsx / GoogleAdsBanner.tsx but is
 * shared here so both pages and the progress indicator behave
 * identically.
 */
export function scrollToStepAnchor(anchorId: string | null): void {
  if (!anchorId) return;
  if (typeof document === 'undefined') return;
  const el = document.getElementById(anchorId);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export const STEP_LABEL_FOR = (key: BuilderStepKey): string => STEP_LABELS[key];
export const STEP_ANCHOR_FOR = (key: BuilderStepKey): string => STEP_ANCHORS[key];
