/**
 * GPTCast Service Worker
 * Coordinates message passing between popup, content script, and offscreen document
 */
import { MSG } from '../shared/message-types.js';
import { STORAGE_KEYS } from '../shared/constants.js';
import { ScriptGenerator } from './script-generator.js';
import { TTSGenerator } from './tts-generator.js';
import { GeminiClient } from './gemini-client.js';

let offscreenDocumentCreated = false;
let offscreenCreationInProgress = false;

/**
 * Ensure offscreen document exists for audio operations
 * Uses locking to prevent race conditions during creation
 */
async function ensureOffscreenDocument() {
  if (offscreenDocumentCreated) return;

  if (offscreenCreationInProgress) {
    while (offscreenCreationInProgress) {
      await new Promise(r => setTimeout(r, 50));
    }
    return;
  }

  offscreenCreationInProgress = true;

  try {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (existingContexts.length > 0) {
      offscreenDocumentCreated = true;
      return;
    }

    await chrome.offscreen.createDocument({
      url: 'src/offscreen/offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Audio mixing and export for podcast generation'
    });
    offscreenDocumentCreated = true;
  } finally {
    offscreenCreationInProgress = false;
  }
}

/**
 * Get decrypted API key from storage
 */
async function getApiKey() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.API_KEY);
  const keyData = stored[STORAGE_KEYS.API_KEY];

  if (!keyData) return null;

  // If stored as encrypted object, decrypt
  if (keyData.data && keyData.iv) {
    try {
      const encKeyData = await chrome.storage.local.get(STORAGE_KEYS.ENCRYPTION_KEY);
      if (!encKeyData[STORAGE_KEYS.ENCRYPTION_KEY]) return null;

      const rawKey = new Uint8Array(encKeyData[STORAGE_KEYS.ENCRYPTION_KEY]);
      const key = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['decrypt']);

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(keyData.iv) },
        key,
        new Uint8Array(keyData.data)
      );

      return new TextDecoder().decode(decrypted);
    } catch {
      return null;
    }
  }

  // If stored as plain string (legacy)
  return typeof keyData === 'string' ? keyData : null;
}

/**
 * Send progress update to popup
 */
function sendProgress(progress) {
  chrome.runtime.sendMessage({ type: MSG.PROGRESS_UPDATE, ...progress }).catch(() => {
    // Popup might be closed, ignore
  });
}

/**
 * Main message handler
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse);
  return true;
});

/**
 * Route messages to appropriate handlers
 */
async function handleMessage(message, sender, sendResponse) {
  try {
    switch (message.type) {
      case MSG.CONVERSATION_DATA:
        if (!message.data || typeof message.data !== 'object') {
          sendResponse({ success: false, error: 'Invalid conversation data' });
          return;
        }
        await chrome.storage.local.set({ [STORAGE_KEYS.CURRENT_CONVERSATION]: message.data });
        sendResponse({ success: true });
        break;

      case MSG.GENERATE_SCRIPT:
        await handleGenerateScript(message, sendResponse);
        break;

      case MSG.GENERATE_TTS:
        await handleGenerateTTS(message, sendResponse);
        break;

      case MSG.MIX_AUDIO:
        await handleMixAudio(message, sendResponse);
        break;

      case MSG.GENERATE_PODCAST:
        await handleGeneratePodcast(message, sendResponse);
        break;

      case MSG.DOWNLOAD_AUDIO:
        await handleDownloadAudio(message, sendResponse);
        break;

      case MSG.TEST_API_KEY:
        await handleTestApiKey(sendResponse);
        break;

      default:
        sendResponse({ error: 'Unknown message type: ' + message.type });
    }
  } catch (error) {
    console.error('[GPTCast SW] Error handling message:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle script generation request
 */
async function handleGenerateScript(message, sendResponse) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    sendResponse({ success: false, error: 'API key not configured. Please add your Gemini API key in Settings.' });
    return;
  }

  const stored = await chrome.storage.local.get(STORAGE_KEYS.CURRENT_CONVERSATION);
  const conversation = stored[STORAGE_KEYS.CURRENT_CONVERSATION];

  if (!conversation) {
    sendResponse({ success: false, error: 'No conversation extracted. Please extract a conversation first.' });
    return;
  }

  try {
    const generator = new ScriptGenerator(apiKey);
    const result = await generator.generate(conversation, {
      condensed: message.condensed || false,
      onProgress: sendProgress
    });

    await chrome.storage.local.set({ [STORAGE_KEYS.CURRENT_SCRIPT]: result });

    sendResponse({ success: true, data: result });
  } catch (error) {
    console.error('[GPTCast SW] Script generation error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle TTS generation request
 */
async function handleGenerateTTS(message, sendResponse) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    sendResponse({ success: false, error: 'API key not configured. Please add your Gemini API key in Settings.' });
    return;
  }

  const stored = await chrome.storage.local.get(STORAGE_KEYS.CURRENT_SCRIPT);
  const scriptResult = stored[STORAGE_KEYS.CURRENT_SCRIPT];

  if (!scriptResult?.script?.segments?.length) {
    sendResponse({ success: false, error: 'No script found. Please generate a script first.' });
    return;
  }

  try {
    const generator = new TTSGenerator(apiKey);
    const result = await generator.generateAudio(scriptResult.script, {
      voice: message.voice,
      onProgress: sendProgress
    });

    await chrome.storage.local.set({ [STORAGE_KEYS.CURRENT_AUDIO]: result });

    sendResponse({ success: true, data: result });
  } catch (error) {
    console.error('[GPTCast SW] TTS generation error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle audio mixing request - forwards to offscreen document
 */
async function handleMixAudio(message, sendResponse) {
  await ensureOffscreenDocument();

  const stored = await chrome.storage.local.get(STORAGE_KEYS.CURRENT_AUDIO);
  const audioResult = stored[STORAGE_KEYS.CURRENT_AUDIO];

  if (!audioResult?.segments?.length) {
    sendResponse({ success: false, error: 'No audio segments. Please generate TTS audio first.' });
    return;
  }

  try {
    const musicUrl = getMusicUrl(message.musicMood || 'calm');

    // Forward to offscreen document for mixing
    const response = await chrome.runtime.sendMessage({
      type: MSG.MIX_AUDIO,
      segments: audioResult.segments,
      musicUrl
    });

    sendResponse(response);
  } catch (error) {
    console.error('[GPTCast SW] Mix audio error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle full podcast generation pipeline
 */
async function handleGeneratePodcast(message, sendResponse) {
  await ensureOffscreenDocument();

  const stored = await chrome.storage.local.get(STORAGE_KEYS.CURRENT_AUDIO);
  const audioResult = stored[STORAGE_KEYS.CURRENT_AUDIO];

  if (!audioResult?.segments?.length) {
    sendResponse({ success: false, error: 'No audio segments. Please generate TTS audio first.' });
    return;
  }

  try {
    const musicUrl = getMusicUrl(message.musicMood || 'calm');

    sendProgress({ stage: 'mixing', progress: 0, detail: 'Starting audio mix...' });

    // Send to offscreen for mixing
    const mixResponse = await chrome.runtime.sendMessage({
      type: MSG.MIX_AUDIO,
      segments: audioResult.segments,
      musicUrl
    });

    if (!mixResponse.success) {
      sendResponse(mixResponse);
      return;
    }

    sendProgress({ stage: 'exporting', progress: 90, detail: 'Preparing download...' });

    // Trigger download
    await triggerDownload(mixResponse.data);

    sendProgress({ stage: 'complete', progress: 100, detail: 'Podcast ready!' });

    sendResponse({ success: true });
  } catch (error) {
    console.error('[GPTCast SW] Podcast generation error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle audio download request
 */
async function handleDownloadAudio(message, sendResponse) {
  try {
    if (!message.data?.audio) {
      sendResponse({ success: false, error: 'No audio data provided' });
      return;
    }

    await triggerDownload(message.data);
    sendResponse({ success: true });
  } catch (error) {
    console.error('[GPTCast SW] Download error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Trigger browser download for audio
 * Uses data URL since Service Workers don't have URL.createObjectURL
 */
async function triggerDownload(audioData) {
  const dataUrl = `data:${audioData.mimeType};base64,${audioData.audio}`;

  const stored = await chrome.storage.local.get(STORAGE_KEYS.CURRENT_CONVERSATION);
  const conversation = stored[STORAGE_KEYS.CURRENT_CONVERSATION];
  const title = sanitizeFilename(conversation?.title || 'podcast');
  const timestamp = new Date().toISOString().slice(0, 10);
  const extension = audioData.mimeType.includes('webm') ? 'webm' : 'mp3';

  await chrome.downloads.download({
    url: dataUrl,
    filename: `gptcast-${title}-${timestamp}.${extension}`,
    saveAs: true
  });
}

/**
 * Sanitize string for filename
 */
function sanitizeFilename(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

/**
 * Get music URL based on mood
 */
function getMusicUrl(mood) {
  const musicMap = {
    calm: chrome.runtime.getURL('assets/music/calm.wav'),
    upbeat: chrome.runtime.getURL('assets/music/upbeat.wav'),
    ambient: chrome.runtime.getURL('assets/music/ambient.wav'),
    none: null
  };
  return musicMap[mood] || musicMap.calm;
}

/**
 * Handle API key test request
 */
async function handleTestApiKey(sendResponse) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    sendResponse({ success: false, error: 'No API key found' });
    return;
  }

  try {
    const client = new GeminiClient(apiKey);
    const result = await client.testApiKey();

    if (result.valid) {
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: result.error || 'Invalid API key' });
    }
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

// Log initialization
console.log('[GPTCast] Service worker initialized');
