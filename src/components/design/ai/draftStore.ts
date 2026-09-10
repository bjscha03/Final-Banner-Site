// IndexedDB keeps image-bearing drafts out of localStorage's small quota.
const DATABASE = 'banners-ai-workspace';
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function loadDraft<T>(key: string): Promise<T | null> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('drafts').objectStore('drafts').get(key);
      request.onsuccess = () => resolve(request.result && Date.now() - request.result.savedAt < 24 * 60 * 60 * 1000 ? request.result.value : null);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
export async function saveDraft(key: string, value: unknown): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('drafts', 'readwrite');
      transaction.objectStore('drafts').put({ value, savedAt: Date.now() }, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
