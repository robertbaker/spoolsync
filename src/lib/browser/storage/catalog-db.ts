/**
 * Where kept reference catalogs' records live. A catalog can hold tens of thousands of records, far
 * beyond what localStorage (about 5 MB per site, as text) holds, so they go to IndexedDB. The small
 * description of each stays in localStorage (see `reference.ts`), so the page can tell at once what
 * is kept. Everything here tolerates storage being blocked or missing (a private window, cleared
 * site data): it reports "nothing kept" or "not stored", never throws.
 */
export interface CatalogBodies {
  get(id: string): Promise<unknown | null>;
  put(id: string, value: unknown): Promise<boolean>;
  /** Removes one catalog, or all of them without an id. */
  remove(id?: string): Promise<void>;
}

const DB_NAME = "spoolsync-reference";
const STORE = "catalogs";

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Runs one request in a transaction; resolves with the request's result, or `fallback`. */
async function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest | null,
  fallback: T,
): Promise<T> {
  const db = await open();
  if (!db) return fallback;
  return new Promise<T>((resolve) => {
    try {
      const transaction = db.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      let result = fallback;
      if (request) request.onsuccess = () => (result = request.result as T);
      transaction.oncomplete = () => {
        db.close();
        resolve(mode === "readonly" ? result : (true as T));
      };
      const fail = () => {
        db.close();
        resolve(fallback);
      };
      transaction.onerror = fail;
      transaction.onabort = fail;
    } catch {
      db.close();
      resolve(fallback);
    }
  });
}

export const browserCatalogBodies: CatalogBodies = {
  async get(id) {
    const value = await run<unknown>("readonly", (store) => store.get(id), null);
    return value ?? null;
  },
  put: (id, value) => run<boolean>("readwrite", (store) => store.put(value, id), false),
  async remove(id) {
    await run<boolean>("readwrite", (store) => (id ? store.delete(id) : store.clear()), false);
  },
};
