/**
 * GPTCast Offscreen Document
 * Handles Web Audio API operations for mixing TTS with background music
 */
import { AudioMixer } from './audio-mixer.js';

// Message types (inline to avoid import issues in offscreen context)
const MSG = {
  MIX_AUDIO: 'mix_audio',
  AUDIO_READY: 'audio_ready',
  PROGRESS_UPDATE: 'progress_update'
};

let mixer = null;

/**
 * Message handler
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sendResponse);
  return true;
});

async function handleMessage(message, sendResponse) {
  switch (message.type) {
    case MSG.MIX_AUDIO:
      await handleMixAudio(message, sendResponse);
      break;

    default:
      sendResponse({ error: 'Unknown message type: ' + message.type });
  }
}

async function handleMixAudio(message, sendResponse) {
  try {
    if (!message.segments?.length) {
      sendResponse({ success: false, error: 'No audio segments provided' });
      return;
    }

    mixer = new AudioMixer();

    const blob = await mixer.mixAudio(
      message.segments,
      message.musicUrl,
      (progress) => {
        try {
          chrome.runtime.sendMessage({
            type: MSG.PROGRESS_UPDATE,
            ...progress
          }).catch(() => {});
        } catch {
          // Popup may be closed
        }
      }
    );

    // Convert blob to base64 for message passing
    const base64 = await blobToBase64(blob);

    sendResponse({
      success: true,
      data: {
        audio: base64,
        mimeType: blob.type,
        size: blob.size
      }
    });

    mixer.cleanup();
    mixer = null;
  } catch (error) {
    console.error('[GPTCast Offscreen] Mix error:', error);
    sendResponse({ success: false, error: error.message });

    if (mixer) {
      mixer.cleanup();
      mixer = null;
    }
  }
}

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

console.log('[GPTCast] Offscreen document ready');
