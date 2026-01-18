/**
 * Storage utilities with encryption for sensitive data
 */
import { STORAGE_KEYS } from './constants.js';

/**
 * Generate or retrieve encryption key
 */
async function getEncryptionKey() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.ENCRYPTION_KEY);

  if (stored[STORAGE_KEYS.ENCRYPTION_KEY]) {
    const keyData = new Uint8Array(stored[STORAGE_KEYS.ENCRYPTION_KEY]);
    return crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
  }

  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const exported = await crypto.subtle.exportKey('raw', key);
  await chrome.storage.local.set({
    [STORAGE_KEYS.ENCRYPTION_KEY]: Array.from(new Uint8Array(exported))
  });

  return key;
}

/**
 * Save API key encrypted
 */
export async function saveApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('Invalid API key');
  }

  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(apiKey)
  );

  await chrome.storage.local.set({
    [STORAGE_KEYS.API_KEY]: {
      data: Array.from(new Uint8Array(encrypted)),
      iv: Array.from(iv)
    }
  });
}

/**
 * Get decrypted API key
 */
export async function getApiKey() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.API_KEY);
  if (!stored[STORAGE_KEYS.API_KEY]) return null;

  try {
    const key = await getEncryptionKey();
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(stored[STORAGE_KEYS.API_KEY].iv) },
      key,
      new Uint8Array(stored[STORAGE_KEYS.API_KEY].data)
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

/**
 * Clear API key from storage
 */
export async function clearApiKey() {
  await chrome.storage.local.remove(STORAGE_KEYS.API_KEY);
}

/**
 * Check if API key exists
 */
export async function hasApiKey() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.API_KEY);
  return !!stored[STORAGE_KEYS.API_KEY];
}
