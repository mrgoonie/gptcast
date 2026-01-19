/**
 * Shared Audio Storage using IndexedDB
 * Allows large audio data transfer between service worker and offscreen document
 */

const DB_NAME = 'gptcast-audio';
const DB_VERSION = 1;
const STORE_NAME = 'segments';

let dbPromise = null;

/**
 * Get or create the IndexedDB database
 */
function getDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });

  return dbPromise;
}

/**
 * Store work data (segments + musicUrl) in IndexedDB
 * This is read by offscreen document immediately on load
 */
export async function storeWorkData(segments, musicUrl) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    store.put({ segments, musicUrl }, 'work');

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
