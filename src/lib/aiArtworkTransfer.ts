import { loadDraft, saveDraft } from '@/components/design/ai/draftStore';
import { sameAIProduct } from '@/components/design/ai/productContext';
import type { AIDesignSession, CreateWithAIProductType } from '@/components/design/ai/types';

type SavedArtwork = {
  fileKey?: string;
  productionPublicId?: string;
  url?: string;
  fileUrl?: string;
  productionUrl?: string;
};

// A local preview is not proof that the order has durable artwork. Upload
// handlers also resolve on validation, cancellation and network failure.
export function requireSavedAIArtwork(artwork: SavedArtwork | null | undefined): void {
  const url = artwork?.productionUrl || artwork?.fileUrl || artwork?.url || '';
  if (!artwork || !(artwork.productionPublicId || artwork.fileKey) || !/^https?:\/\//i.test(url)) {
    throw new Error('Your design is still here, but we could not save it to your order. Please try Approve design & continue again.');
  }
}

function sessionKey(artwork: SavedArtwork | null | undefined): string | null {
  const identity = artwork?.productionPublicId || artwork?.fileKey;
  return identity ? `approved-artwork:${identity}` : null;
}

// Keep image-bearing history in IndexedDB, never in the cart's localStorage.
// The exact persisted source identity prevents cross-item draft substitution.
export async function rememberAIArtworkSession(artwork: SavedArtwork, session: AIDesignSession): Promise<void> {
  const key = sessionKey(artwork);
  if (key) await saveDraft(key, session).catch(() => {});
}

export async function restoreAIArtworkSession(
  artwork: SavedArtwork | null | undefined,
  product: { productType: CreateWithAIProductType; widthIn: number; heightIn: number },
): Promise<AIDesignSession | null> {
  const key = sessionKey(artwork);
  if (!key) return null;
  const session = await loadDraft<AIDesignSession>(key).catch(() => null);
  if (!session?.selectedConcept?.versionId || !sameAIProduct(session.brief, product)
    || !sameAIProduct(session.selectedConcept.brief || { ...session.selectedConcept, productType: session.brief.productType }, product)) return null;
  return session;
}
