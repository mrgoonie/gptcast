/**
 * GPTCast Offscreen Document
 * Handles Web Audio API operations for mixing TTS with background music
 */

// Global error handlers to catch initialization issues
window.onerror = (msg, url, line, col, error) => {
  console.error('[GPTCast Offscreen] Global error:', msg, 'at', url, line, col, error);
};
window.onunhandledrejection = (event) => {
  console.error('[GPTCast Offscreen] Unhandled rejection:', event.reason);
};

console.log('[GPTCast Offscreen] Script starting...');

// Use dynamic import to catch and log any import errors
let AudioMixer;
try {
  const module = await import('./audio-mixer.js');
  AudioMixer = module.AudioMixer;
  console.log('[GPTCast Offscreen] AudioMixer imported successfully');
} catch (e) {
  console.error('[GPTCast Offscreen] Failed to import AudioMixer:', e);
}

// Message types (inline to avoid import issues in offscreen context)
const MSG = {
  MIX_AUDIO_OFFSCREEN: 'mix_audio_offscreen',  // From service worker
  OFFSCREEN_READY: 'offscreen_ready',  // Signal to SW that we're ready
  AUDIO_READY: 'audio_ready',
  PROGRESS_UPDATE: 'progress_update'
};

// ============================================================================
// IndexedDB functions (inlined to avoid cross-context import issues)
// ============================================================================
const DB_NAME = 'gptcast-audio';
const DB_VERSION = 1;
const STORE_NAME = 'segments';
let dbPromise = null;

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

async function getWorkData() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get('work');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function clearWorkData() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete('work');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

let mixer = null;

/**
 * Auto-start processing immediately on load
 * Service worker stores data to IndexedDB BEFORE creating offscreen,
 * so we can read and process immediately without waiting for a message.
 */
console.log('[GPTCast Offscreen] Starting auto-processing...');

async function autoProcess() {
  console.log('[GPTCast Offscreen] Auto-process started');

  if (!AudioMixer) {
    console.error('[GPTCast Offscreen] AudioMixer not loaded!');
    chrome.runtime.sendMessage({
      type: 'mix_audio_result',
      success: false,
      error: 'AudioMixer module failed to load'
    }).catch(() => {});
    return;
  }

  try {
    // Read work parameters from IndexedDB
    const workData = await getWorkData();
    console.log('[GPTCast Offscreen] Work data:', workData ? 'found' : 'not found');

    if (!workData) {
      chrome.runtime.sendMessage({
        type: 'mix_audio_result',
        success: false,
        error: 'No work data found in storage'
      }).catch(() => {});
      return;
    }

    const { segments, musicUrl } = workData;
    console.log('[GPTCast Offscreen] Segments:', segments?.length, 'Music:', musicUrl);

    if (!segments?.length) {
      chrome.runtime.sendMessage({
        type: 'mix_audio_result',
        success: false,
        error: 'No audio segments found'
      }).catch(() => {});
      return;
    }

    mixer = new AudioMixer();

    console.log('[GPTCast Offscreen] Calling mixer.mixAudio with', segments.length, 'segments...');
    console.log('[GPTCast Offscreen] NOTE: Real-time recording - this takes the actual duration of the audio!');

    const blob = await mixer.mixAudio(
      segments,
      musicUrl,
      (progress) => {
        chrome.runtime.sendMessage({
          type: MSG.PROGRESS_UPDATE,
          ...progress
        }).catch(() => {});
      }
    );

    console.log('[GPTCast Offscreen] Mix complete, blob size:', blob.size);

    // Convert blob to base64 for message passing
    const base64 = await blobToBase64(blob);
    console.log('[GPTCast Offscreen] Converted to base64, length:', base64.length);

    // Send result back to service worker
    chrome.runtime.sendMessage({
      type: 'mix_audio_result',
      success: true,
      data: {
        audio: base64,
        mimeType: blob.type,
        size: blob.size
      }
    }).catch(() => {});

    console.log('[GPTCast Offscreen] Result sent to service worker');

    // Cleanup
    mixer.cleanup();
    mixer = null;
    await clearWorkData();

  } catch (error) {
    console.error('[GPTCast Offscreen] Mix error:', error);
    chrome.runtime.sendMessage({
      type: 'mix_audio_result',
      success: false,
      error: error.message
    }).catch(() => {});

    if (mixer) {
      mixer.cleanup();
      mixer = null;
    }
  }
}

// Start processing immediately
autoProcess();

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // Remove data URL prefix (data:audio/webm;base64,)
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to convert blob to base64'));
    reader.readAsDataURL(blob);
  });
}

// Note: No ready signal needed - we auto-process immediately on load
