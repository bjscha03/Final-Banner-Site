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
  /**
   * Explicit user-confirmation flags. The step machine treats a step as
   * incomplete unless the user has actively interacted with it — default
   * preselected values (e.g. material `13oz`, quantity `1`, preset size 0)
   * never advance the progress indicator on their own. All four default
   * to `true` for backward compatibility so callers that don't track
   * confirmation get the old "any valid value = complete" behaviour.
   *
   * Pages restoring a saved cart-edit state should pre-set every flag
   * to true so the user doesn't have to re-confirm an existing order.
   */
  sizeConfirmed?: boolean;
  materialConfirmed?: boolean;
  quantityConfirmed?: boolean;
  optionsReviewed?: boolean;
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
  /** 1-indexed current step number. Equals `total` when all steps are complete. */
  current: number;
  /** Total number of steps shown in the progress indicator. */
  total: number;
  /** Human-readable label for the current step (or completion). */
  label: string;
  /** Per-step completion (parallel array to BUILDER_STEPS). */
  completed: Record<BuilderStepKey, boolean>;
  /** True when every step has been completed. */
  isComplete: boolean;
}

const STEP_LABELS: Record<BuilderStepKey, string> = {
  size: 'Choose size',
  material: 'Select material',
  quantity: 'Choose quantity',
  options: 'Choose options',
  upload: 'Upload artwork',
};

/** Label rendered when every step is complete and Add-to-Cart is the next action. */
export const COMPLETE_PROGRESS_LABEL = 'Ready to add to cart';

const STEP_ANCHORS: Record<BuilderStepKey, string> = {
  size: 'size-section',
  material: 'material-section',
  quantity: 'quantity-section',
  options: 'options-section',
  upload: 'upload-section',
};

function isSizeValid(state: BuilderStepState): boolean {
  if (!(state.widthIn && state.heightIn && state.widthIn > 0 && state.heightIn > 0)) return false;
  return state.sizeConfirmed !== false;
}

function isMaterialValid(state: BuilderStepState): boolean {
  if (!state.material) return false;
  return state.materialConfirmed !== false;
}

function isQuantityValid(state: BuilderStepState): boolean {
  const q = state.quantity;
  if (!(typeof q === 'number' && Number.isFinite(q) && q >= 1)) return false;
  return state.quantityConfirmed !== false;
}

function isOptionsComplete(state: BuilderStepState): boolean {
  // Even when the options card is informational (default), a step-by-step
  // mobile flow still wants the user to acknowledge the section before
  // moving on to upload — so an explicit `optionsReviewed === false` always
  // marks this step incomplete. When the caller doesn't track review
  // (`optionsReviewed` undefined), fall back to the previous behaviour
  // (informational = always complete; required = check `optionsValid`).
  if (state.optionsReviewed === false) return false;
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
  const isComplete = idx === -1;
  const current = isComplete ? BUILDER_STEPS.length : idx + 1;
  const currentKey = BUILDER_STEPS[Math.min(current - 1, BUILDER_STEPS.length - 1)];
  const label = isComplete ? COMPLETE_PROGRESS_LABEL : STEP_LABELS[currentKey];
  return {
    current,
    total: BUILDER_STEPS.length,
    label,
    completed,
    isComplete,
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

  if (!isOptionsComplete(state)) {
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
 * Smooth-scroll a section into view by id. Honors `scroll-margin-top`
 * (set on each `ConfigCard`) so the target lands below the sticky
 * header / product tabs, not behind them. Falls back to a manual
 * `window.scrollTo` calculation when `scrollIntoView` is unavailable.
 */
export function scrollToStepAnchor(anchorId: string | null): void {
  if (!anchorId) return;
  if (typeof document === 'undefined') return;
  const el = document.getElementById(anchorId);
  if (!el) return;
  // Best-effort offset accounting: sticky header (~64px) + product tabs
  // (~56px) + breathing room. CSS `scroll-margin-top` already handles
  // most of this on supported browsers (all evergreen + iOS Safari 14.5+);
  // the manual fallback below handles older Safari and pages that omit
  // the utility class on a custom element.
  if (typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (typeof window !== 'undefined') {
    const offset = 128; // header (64) + product tabs (~56) + 8px gap
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }
}

export const STEP_LABEL_FOR = (key: BuilderStepKey): string => STEP_LABELS[key];
export const STEP_ANCHOR_FOR = (key: BuilderStepKey): string => STEP_ANCHORS[key];

// ============================================================================
// YARD SIGN STATE MACHINE
// ============================================================================
//
// Yard signs don't follow the size/material/quantity/options/upload pattern
// because:
//   - Size is locked (24" × 18")
//   - "Material" is really print side (single vs. double-sided)
//   - Multiple designs upload, each with its own quantity
//   - Total quantity must be a multiple of 10
//   - Stakes finishing should be reviewed before Add to Cart
//
// `getYardSignCtaState` returns a single contextual CTA descriptor that
// always advances the user by exactly one step: Choose Print Side →
// Add a Design → Uploading… → Retry Upload → Review Design → Assign
// Quantities → Fix Quantity → Review Stakes → Add to Cart.

export interface YardSignCtaState {
  /** True until the user clicks "Start Order" / scrolls past hero. */
  showEntryCta: boolean;
  /** Print side selected? Yard signs default to 'single', so this is true unless the user explicitly cleared it. */
  printSideSelected: boolean;
  /** Has the user actively confirmed/reviewed the print side card? */
  printSideReviewed: boolean;
  /** Number of uploaded designs. */
  designCount: number;
  /** ID of the first design that has NOT yet been preview-confirmed (no previewThumbnailUrl), if any. */
  unconfirmedDesignId: string | null;
  /** Total signs across all designs. */
  totalQuantity: number;
  /** Whether totalQuantity is a valid multiple of 10 within bounds. */
  quantityValid: boolean;
  /** Validation message when quantityValid is false. */
  quantityValidationMessage: string | null;
  /** Has the user reviewed/confirmed the Add Stakes step? */
  stakesReviewed: boolean;
  /** Yard-sign-side upload lifecycle (mirrored from YardSignConfigurator). */
  isUploading: boolean;
  uploadError: string | null;
  /** True once any item has just been added to the cart (post-add success state). */
  hasJustAddedToCart: boolean;
  /** Total cart item count (for the "View Cart (n)" label). */
  cartItemCount: number;
}

export type YardSignCtaStep =
  | 'entry'
  | 'view_cart'
  | 'print_side'
  | 'add_design'
  | 'uploading'
  | 'upload_error'
  | 'review_design'
  | 'assign_quantities'
  | 'fix_quantity'
  | 'review_stakes'
  | 'add_to_cart';

export interface YardSignCtaDescriptor {
  step: YardSignCtaStep;
  label: string;
  scrollTargetId: string | null;
  /** When 'review_design', the design id that needs confirmation. */
  designId?: string;
  disabled: boolean;
  loading: boolean;
  helper: string | null;
}

export const YARD_SIGN_ANCHORS = {
  size: 'yard-size-section',
  printSide: 'yard-print-side-section',
  upload: 'yard-upload-section',
  quantity: 'yard-quantity-section',
  finishing: 'yard-finishing-section',
} as const;

export function getYardSignCtaState(state: YardSignCtaState): YardSignCtaDescriptor {
  // Post-add-to-cart: always show "View Cart" until the user starts another build.
  if (state.hasJustAddedToCart) {
    const n = state.cartItemCount;
    return {
      step: 'view_cart',
      label: n > 0 ? `View Cart (${n})` : 'View Cart',
      scrollTargetId: null,
      disabled: false,
      loading: false,
      helper: 'Added to cart ✓',
    };
  }

  if (state.showEntryCta) {
    return {
      step: 'entry',
      label: 'Start Yard Sign Order',
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
      helper: 'Uploading your design — this can take a few seconds.',
    };
  }

  // Upload error blocks progress only when there is no usable design yet.
  if (state.uploadError && state.designCount === 0) {
    return {
      step: 'upload_error',
      label: 'Retry Upload',
      scrollTargetId: YARD_SIGN_ANCHORS.upload,
      disabled: false,
      loading: false,
      helper: state.uploadError,
    };
  }

  // Step 2 — Print side. Default 'single' is preselected, but a deliberate
  // review by the user (tapping the CTA / a card) still counts.
  if (!state.printSideSelected) {
    return {
      step: 'print_side',
      label: 'Choose Print Side',
      scrollTargetId: YARD_SIGN_ANCHORS.printSide,
      disabled: false,
      loading: false,
      helper: 'Pick single- or double-sided printing.',
    };
  }

  // Step 3 — At least one design must exist.
  if (state.designCount === 0) {
    return {
      step: 'add_design',
      label: 'Add a Design',
      scrollTargetId: YARD_SIGN_ANCHORS.upload,
      disabled: false,
      loading: false,
      helper: 'Upload artwork to continue.',
    };
  }

  // Step 4a — Any uploaded design that hasn't been preview-confirmed?
  // Done in the preview modal saves a previewThumbnailUrl; until then,
  // the design is "uploaded but not reviewed".
  if (state.unconfirmedDesignId) {
    return {
      step: 'review_design',
      label: 'Review Design',
      scrollTargetId: YARD_SIGN_ANCHORS.upload,
      designId: state.unconfirmedDesignId,
      disabled: false,
      loading: false,
      helper: 'Tap to position your design before adding to cart.',
    };
  }

  // Step 4b — Quantity assignment. Total of 0 means user hasn't picked any.
  if (state.totalQuantity === 0) {
    return {
      step: 'assign_quantities',
      label: 'Assign Quantities',
      scrollTargetId: YARD_SIGN_ANCHORS.quantity,
      disabled: false,
      loading: false,
      helper: 'Yard signs must be ordered in increments of 10 (10, 20, 30, etc.).',
    };
  }

  if (!state.quantityValid) {
    return {
      step: 'fix_quantity',
      label: 'Fix Quantity',
      scrollTargetId: YARD_SIGN_ANCHORS.quantity,
      disabled: false,
      loading: false,
      helper:
        state.quantityValidationMessage ??
        'Yard signs must be ordered in increments of 10 (10, 20, 30, etc.).',
    };
  }

  // Step 5 — Stakes review (optional but explicit).
  if (!state.stakesReviewed) {
    return {
      step: 'review_stakes',
      label: 'Review Stakes',
      scrollTargetId: YARD_SIGN_ANCHORS.finishing,
      disabled: false,
      loading: false,
      helper: 'Optional — choose whether to add wire H-stakes.',
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

// ============================================================================
// POST-ADD-TO-CART OVERRIDE FOR BANNER / CAR MAGNET FLOWS
// ============================================================================
//
// When the user has just successfully added an item to the cart, the
// shared step machine should NOT keep showing "Upload Artwork" — it
// should switch to a "View Cart (n)" success state. Pages call this
// helper after `getNextStep(...)` returns to wrap the descriptor.

export function getPostAddToCartCta(cartItemCount: number): BuilderCtaDescriptor {
  return {
    step: 'add_to_cart', // re-uses the same step type for layout
    label: cartItemCount > 0 ? `View Cart (${cartItemCount})` : 'View Cart',
    scrollTargetId: null,
    disabled: false,
    loading: false,
    helper: 'Added to cart ✓',
  };
}
