/**
 * GPTCast Service Worker
 * Coordinates message passing between popup, content script, and offscreen document
 */
import { MSG } from '../shared/message-types.js';
import { STORAGE_KEYS } from '../shared/constants.js';
import { ScriptGenerator } from './script-generator.js';
import { TTSGenerator } from './tts-generator.js';
import { GeminiClient } from './gemini-client.js';
import { storeWorkData } from '../shared/audio-storage.js';

// In-memory cache for audio (too large for chrome.storage.local quota)
let currentAudioResult = null;

// Promise resolver for mix result (set when waiting for offscreen result)
let mixResultResolve = null;

/**
 * Close any existing offscreen document
 */
async function closeOffscreenDocument() {
  try {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    if (existingContexts.length > 0) {
      await chrome.offscreen.closeDocument();
    }
  } catch (e) {
    // Ignore errors
  }
}

/**
 * Run audio mixing in offscreen document
 * New flow: Store data FIRST, then create offscreen which auto-processes
 */
async function runOffscreenMixing(segments, musicUrl) {
  // Close any existing offscreen document first
  await closeOffscreenDocument();

  // Store work data BEFORE creating offscreen
  console.log('[GPTCast SW] Storing work data in IndexedDB:', segments.length, 'segments');
  await storeWorkData(segments, musicUrl);

  // Create promise to wait for result
  const resultPromise = new Promise((resolve, reject) => {
    mixResultResolve = resolve;
    // Timeout after 5 minutes (audio mixing can take a while)
    setTimeout(() => {
      mixResultResolve = null;
      reject(new Error('Audio mixing timeout'));
    }, 300000);
  });

  // Create offscreen document - it will auto-process immediately
  console.log('[GPTCast SW] Creating offscreen document...');
  await chrome.offscreen.createDocument({
    url: 'src/offscreen/offscreen.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Audio mixing and export for podcast generation'
  });
  console.log('[GPTCast SW] Offscreen document created, waiting for result...');

  // Wait for result from offscreen
  const result = await resultPromise;
  console.log('[GPTCast SW] Mix result received:', result?.success);

  // Close offscreen document after processing
  await closeOffscreenDocument();

  return result;
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
 * Returns true only for messages we handle asynchronously
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle mix result from offscreen document
  if (message.type === 'mix_audio_result') {
    console.log('[GPTCast SW] Received mix result from offscreen:', message.success);
    if (!message.success) {
      console.error('[GPTCast SW] Mix error from offscreen:', message.error);
    }
    if (mixResultResolve) {
      mixResultResolve(message);
      mixResultResolve = null;
    }
    return false;
  }

  // Ignore progress updates from offscreen - no response needed
  if (message.type === MSG.PROGRESS_UPDATE) {
    return false;
  }

  // Ignore other messages from offscreen document
  if (sender.url?.includes('offscreen')) {
    return false;
  }

  // Handle known message types asynchronously
  const knownTypes = [
    MSG.CONVERSATION_DATA,
    MSG.GENERATE_SCRIPT,
    MSG.GENERATE_TTS,
    MSG.MIX_AUDIO,
    MSG.GENERATE_PODCAST,
    MSG.DOWNLOAD_AUDIO,
    MSG.TEST_API_KEY
  ];

  if (knownTypes.includes(message.type)) {
    handleMessage(message, sender, sendResponse);
    return true; // Will respond asynchronously
  }

  // Unknown message type - don't handle
  return false;
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
        sendResponse({ success: false, error: 'Unknown message type: ' + message.type });
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

    // Check for error segments
    const errorSegments = result.segments.filter(s => s.type === 'error');
    if (errorSegments.length > 0) {
      console.error('[GPTCast SW] TTS errors:', errorSegments);
      const audioSegments = result.segments.filter(s => s.type === 'audio' || s.type === 'audio_chunked');
      if (audioSegments.length === 0) {
        sendResponse({ success: false, error: `TTS failed: ${errorSegments[0].error}` });
        return;
      }
      console.warn(`[GPTCast SW] ${errorSegments.length} segments failed, ${audioSegments.length} succeeded`);
    }

    // Store in memory (too large for chrome.storage.local quota)
    currentAudioResult = result;

    sendResponse({ success: true, data: { segmentCount: result.segments.length } });
  } catch (error) {
    console.error('[GPTCast SW] TTS generation error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle audio mixing request - uses new auto-processing offscreen flow
 */
async function handleMixAudio(message, sendResponse) {
  if (!currentAudioResult?.segments?.length) {
    sendResponse({ success: false, error: 'No audio segments. Please generate TTS audio first.' });
    return;
  }

  try {
    const musicUrl = getMusicUrl(message.musicMood || 'calm');
    const response = await runOffscreenMixing(currentAudioResult.segments, musicUrl);
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
  if (!currentAudioResult?.segments?.length) {
    sendResponse({ success: false, error: 'No audio segments. Please generate TTS audio first.' });
    return;
  }

  try {
    const musicUrl = getMusicUrl(message.musicMood || 'calm');

    sendProgress({ stage: 'mixing', progress: 0, detail: 'Starting audio mix...' });

    // Run mixing in offscreen document (auto-processing flow)
    const mixResponse = await runOffscreenMixing(currentAudioResult.segments, musicUrl);

    if (!mixResponse?.success) {
      sendResponse(mixResponse || { success: false, error: 'No response from audio mixer' });
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
  const extension = audioData.mimeType.includes('wav') ? 'wav' :
                    audioData.mimeType.includes('webm') ? 'webm' : 'mp3';

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
