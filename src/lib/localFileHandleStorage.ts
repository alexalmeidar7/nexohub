/**
 * localFileHandleStorage.ts
 *
 * Persists FileSystemFileHandle instances across page reloads/browser sessions
 * using IndexedDB. Supported natively by modern Chromium browsers (Chrome, Edge, etc.).
 */

const DB_NAME = "nexohub_storage";
const STORE_NAME = "file_handles";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not supported in this environment"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB"));
  });
}

/**
 * Saves a FileSystemFileHandle into IndexedDB.
 */
export async function saveLocalFileHandle(key: string, handle: FileSystemFileHandle): Promise<void> {
  if (!key || !handle) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(handle, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error("Failed to put handle in IndexedDB"));
    });
  } catch (err) {
    console.warn("[localFileHandleStorage] Error saving handle for key:", key, err);
  }
}

/**
 * Retrieves a FileSystemFileHandle from IndexedDB.
 */
export async function getLocalFileHandle(key: string): Promise<FileSystemFileHandle | null> {
  if (!key) return null;
  try {
    const db = await openDb();
    return await new Promise<FileSystemFileHandle | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as FileSystemFileHandle) || null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn("[localFileHandleStorage] Error getting handle for key:", key, err);
    return null;
  }
}

/**
 * Deletes a stored FileSystemFileHandle from IndexedDB.
 */
export async function removeLocalFileHandle(key: string): Promise<void> {
  if (!key) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch (err) {
    console.warn("[localFileHandleStorage] Error removing handle for key:", key, err);
  }
}
