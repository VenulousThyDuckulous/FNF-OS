/** Minimal promise wrapper around IndexedDB. No dependency, no magic. */

export const DB_NAME = 'fnf-os';
export const DB_VERSION = 3;

export const STORES = {
  mods: 'mods',
  modFiles: 'modFiles',
  covers: 'covers',
  collections: 'collections',
  projects: 'projects',
  scores: 'scores',
  meta: 'meta',
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

let cached: IDBDatabase | null = null;

export function openDatabase(): Promise<IDBDatabase> {
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.mods)) db.createObjectStore(STORES.mods, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.modFiles)) db.createObjectStore(STORES.modFiles, { keyPath: 'modId' });
      if (!db.objectStoreNames.contains(STORES.covers)) db.createObjectStore(STORES.covers, { keyPath: 'modId' });
      if (!db.objectStoreNames.contains(STORES.collections)) db.createObjectStore(STORES.collections, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.projects)) db.createObjectStore(STORES.projects, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.scores)) db.createObjectStore(STORES.scores, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.meta)) db.createObjectStore(STORES.meta);
    };

    request.onsuccess = () => {
      cached = request.result;
      cached.onversionchange = () => {
        cached?.close();
        cached = null;
      };
      resolve(cached);
    };
    request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened.'));
    request.onblocked = () => reject(new Error('IndexedDB is blocked by another open tab.'));
  });
}

function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

export async function getRecord<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDatabase();
  const tx = db.transaction(store, 'readonly');
  return wrap<T | undefined>(tx.objectStore(store).get(key) as IDBRequest<T | undefined>);
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDatabase();
  const tx = db.transaction(store, 'readonly');
  return wrap<T[]>(tx.objectStore(store).getAll() as IDBRequest<T[]>);
}

export async function putRecord<T>(store: StoreName, value: T, key?: IDBValidKey): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const objectStore = tx.objectStore(store);
    if (key === undefined) objectStore.put(value as unknown as never);
    else objectStore.put(value as unknown as never, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted, possibly out of space.'));
  });
}

export async function deleteRecord(store: StoreName, key: IDBValidKey): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed.'));
  });
}

export async function clearStore(store: StoreName): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB clear failed.'));
  });
}
