// Persist the loaded source image + analyzed library across restarts, in the
// webview's IndexedDB. We store each card's Lab signature + a small JPEG
// thumbnail (not the originals), so restore is fast and self-contained.

const DB = "mosaicos";
const STORE = "kv";
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function put(key: string, val: unknown): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function get<T>(key: string): Promise<T | undefined> {
  const db = await open();
  const val = await new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const rq = tx.objectStore(STORE).get(key);
    rq.onsuccess = () => resolve(rq.result as T | undefined);
    rq.onerror = () => reject(rq.error);
  });
  db.close();
  return val;
}

export interface SavedPhoto {
  sig: Float32Array;
  thumb: Blob;
  top: boolean;
  path?: string;
}
export interface SavedLibrary {
  path: string;
  photos: SavedPhoto[];
}
export interface SavedSource {
  blob: Blob;
  name: string;
}

export const saveSource = (s: SavedSource) => put("source", s).catch(() => {});
export const saveLibrary = (l: SavedLibrary) => put("library", l).catch(() => {});
export const loadSourceCache = () => get<SavedSource>("source").catch(() => undefined);
export const loadLibraryCache = () => get<SavedLibrary>("library").catch(() => undefined);
