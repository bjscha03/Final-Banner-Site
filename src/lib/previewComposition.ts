import {
  getExpandedPreviewSelection,
  type PreviewableItem,
} from './previewSelection';

/** True only when the selected source is already a baked composition. */
export function hasExactCompositionPreview(item: PreviewableItem): boolean {
  return getExpandedPreviewSelection(item).isExactComposition;
}
