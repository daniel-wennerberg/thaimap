// Tiny IndexedDB key-value store (falls back to memory if IndexedDB is unavailable, e.g. some private modes).
// Holds the last family snapshot and the queue of changes made offline.

const DB = 'thaimap', STORE = 'kv';
let dbp: Promise<IDBDatabase | null> | null = null;
const mem = new Map<string, unknown>();

function db(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return db().then((d) => new Promise<T | undefined>((resolve) => {
    if (!d) return resolve(undefined);
    try {
      const req = fn(d.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch { resolve(undefined); }
  }));
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const v = await tx<T>('readonly', (s) => s.get(key));
  return v === undefined ? (mem.get(key) as T | undefined) : v;
}
export async function idbSet(key: string, value: unknown): Promise<void> {
  mem.set(key, value);
  // a JSON copy decouples the stored value from live state (and drops anything non-cloneable)
  await tx('readwrite', (s) => s.put(JSON.parse(JSON.stringify(value)), key));
}
export async function idbDel(key: string): Promise<void> {
  mem.delete(key);
  await tx('readwrite', (s) => s.delete(key));
}
