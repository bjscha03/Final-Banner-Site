import { useCartStore, type CartItem } from '@/store/cart';
import { uploadCanvasImageToCloudinary } from '@/utils/uploadCanvasImage';

let installed = false;
let activeSync: Promise<void> | null = null;

export const isTemporaryCartThumbnail = (value?: string | null): boolean => (
  typeof value === 'string'
  && (value.startsWith('data:image/') || value.startsWith('blob:'))
);

const uploadPermanentThumbnail = async (item: CartItem): Promise<string> => {
  const source = item.thumbnail_url;
  if (!isTemporaryCartThumbnail(source)) return source || '';

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const uploaded = await uploadCanvasImageToCloudinary(
        source,
        `cart-thumbnail-${item.id}-${Date.now()}.png`,
      );
      if (!uploaded.secureUrl) throw new Error('Thumbnail upload returned no permanent URL');
      return uploaded.secureUrl;
    } catch (error) {
      lastError = error;
      console.warn('[cart-thumbnail] persistence attempt failed', {
        itemId: item.id,
        attempt,
        error,
      });
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Could not persist the cart thumbnail');
};

const persistTemporaryThumbnails = async (): Promise<void> => {
  const items = useCartStore.getState().items;
  const temporaryItems = items.filter((item) => isTemporaryCartThumbnail(item.thumbnail_url));
  if (!temporaryItems.length) return;

  const permanentById = new Map<string, string>();
  for (const item of temporaryItems) {
    const permanentUrl = await uploadPermanentThumbnail(item);
    permanentById.set(item.id, permanentUrl);
  }

  useCartStore.setState((state) => ({
    items: state.items.map((item) => {
      const permanentUrl = permanentById.get(item.id);
      return permanentUrl ? { ...item, thumbnail_url: permanentUrl } : item;
    }),
  }));
};

const hasTemporaryThumbnail = (): boolean => useCartStore
  .getState()
  .items
  .some((item) => isTemporaryCartThumbnail(item.thumbnail_url));

/**
 * Ensures cart thumbnails survive route changes, browser differences, and
 * server-cart reloads. The design page creates an immediate data-image proof;
 * this guard uploads that proof before the cart is synced or reloaded.
 */
export const installCartThumbnailPersistence = (): void => {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const originalSyncToServer = useCartStore.getState().syncToServer;
  const originalLoadFromServer = useCartStore.getState().loadFromServer;

  const guardedSyncToServer = async (): Promise<void> => {
    if (activeSync) return activeSync;

    activeSync = (async () => {
      // Set this before any awaited work so Checkout cannot load the server
      // cart and erase the local proof during the upload.
      useCartStore.setState({ isSyncing: true });
      try {
        await persistTemporaryThumbnails();
        await originalSyncToServer();
      } catch (error) {
        // Keep the local cart and temporary proof intact. A later cart action
        // can retry rather than syncing a cart with the thumbnail stripped.
        console.error('[cart-thumbnail] permanent persistence failed; server sync skipped', error);
      } finally {
        useCartStore.setState({ isSyncing: false });
        activeSync = null;
      }
    })();

    return activeSync;
  };

  const guardedLoadFromServer = async (): Promise<void> => {
    if (hasTemporaryThumbnail() || activeSync) {
      await guardedSyncToServer();
    }

    // If persistence still failed, preserve the usable local proof and do not
    // replace it with a server cart whose thumbnail was intentionally stripped.
    if (hasTemporaryThumbnail()) {
      console.warn('[cart-thumbnail] server cart load deferred until thumbnail persistence succeeds');
      return;
    }

    await originalLoadFromServer();
  };

  useCartStore.setState({
    syncToServer: guardedSyncToServer,
    loadFromServer: guardedLoadFromServer,
  });
};
