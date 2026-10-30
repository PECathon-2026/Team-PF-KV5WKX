/**
 * Persistent storage for Spirit Lens restoration results (IndexedDB).
 *
 * Why IndexedDB: each result contains two base64 images (raw + restored) that are
 * several MB. localStorage is capped at ~5 MB and throws QuotaExceededError, so the
 * old approach (React state only) lost everything on refresh.
 */
import type { AstroRestorationResponse } from '../components/SpiritLensSection';

const DB_NAME = 'tsukiyomi-spirit-lens';
const DB_VERSION = 1;
const STORE = 'restorations';
const LATEST_ID = 'latest';
const MAX_HISTORY = 8;

export interface StoredRestoration {
  id: string; // 'latest' or `hist-<timestamp>`
  captureTitle: string;
  savedAt: number;
  result: AstroRestorationResponse;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function reqResult<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Save as the "latest" result (shown by Dojo on reload) and add to history. */
export async function saveRestoration(
  result: AstroRestorationResponse,
  captureTitle: string
): Promise<void> {
  try {
    const db = await openDb();
    const now = Date.now();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);

    store.put({ id: LATEST_ID, captureTitle, savedAt: now, result } as StoredRestoration);
    store.put({ id: `hist-${now}`, captureTitle, savedAt: now, result } as StoredRestoration);

    // Trim history to the newest MAX_HISTORY entries
    const all = (await reqResult(store.getAll())) as StoredRestoration[];
    const hist = all
      .filter((r) => r.id.startsWith('hist-'))
      .sort((a, b) => b.savedAt - a.savedAt);
    hist.slice(MAX_HISTORY).forEach((r) => store.delete(r.id));

    await txDone(tx);
    db.close();
  } catch (err) {
    console.warn('Could not persist restoration to IndexedDB:', err);
  }
}

export async function loadLatestRestoration(): Promise<StoredRestoration | null> {
  try {
    const db = await openDb();
    const rec = await reqResult(
      db.transaction(STORE, 'readonly').objectStore(STORE).get(LATEST_ID)
    );
    db.close();
    return (rec as StoredRestoration) ?? null;
  } catch (err) {
    console.warn('Could not read restoration from IndexedDB:', err);
    return null;
  }
}

export async function listRestorationHistory(): Promise<StoredRestoration[]> {
  try {
    const db = await openDb();
    const all = (await reqResult(
      db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
    )) as StoredRestoration[];
    db.close();
    return all.filter((r) => r.id.startsWith('hist-')).sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

export async function clearRestorations(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    await txDone(tx);
    db.close();
  } catch (err) {
    console.warn('Could not clear stored restorations:', err);
  }
}
