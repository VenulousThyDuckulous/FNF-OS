/** Storage quota awareness. Browsers change limits without telling anyone. */

export interface StorageSnapshot {
  supported: boolean;
  usage: number | null;
  quota: number | null;
  persisted: boolean | null;
  /** Fraction of quota used, 0-1, when known. */
  ratio: number | null;
}

export async function readStorage(): Promise<StorageSnapshot> {
  if (typeof navigator === 'undefined' || !navigator.storage) {
    return { supported: false, usage: null, quota: null, persisted: null, ratio: null };
  }

  let usage: number | null = null;
  let quota: number | null = null;
  let persisted: boolean | null = null;

  try {
    if (navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      usage = estimate.usage ?? null;
      quota = estimate.quota ?? null;
    }
  } catch {
    /* estimate is best-effort */
  }

  try {
    if (navigator.storage.persisted) persisted = await navigator.storage.persisted();
  } catch {
    persisted = null;
  }

  return {
    supported: true,
    usage,
    quota,
    persisted,
    ratio: usage !== null && quota ? usage / quota : null,
  };
}

export async function requestPersistence(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** Below ~12% free space we warn; we never invent a fixed storage promise. */
export function storageWarning(snapshot: StorageSnapshot): string | null {
  if (snapshot.ratio === null) return null;
  if (snapshot.ratio > 0.88) {
    return 'Your browser storage is almost full. Import may fail; export or delete mods to free space.';
  }
  if (snapshot.ratio > 0.7) {
    return 'Browser storage is getting full. Consider exporting a backup of your library.';
  }
  return null;
}
