/**
 * Shared constants for GPTCast extension
 */

// API Configuration
export const API = {
  GEMINI_BASE: 'https://generativelanguage.googleapis.com/v1beta/models',
  GEMINI_MODEL: 'gemini-2.0-flash',
  GEMINI_TTS_MODEL: 'gemini-2.5-flash-tts',
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
  TIMEOUT_TEXT_MS: 30000,
  TIMEOUT_TTS_MS: 60000,
  // Token limits for chunking (conservative estimates)
  MAX_TOKENS_BEFORE_CHUNKING: 100000, // ~400k chars
  MAX_TOKENS_PER_CHUNK: 50000 // ~200k chars
};

// TTS Configuration
export const TTS = {
  SAMPLE_RATE: 24000,
  CHANNELS: 1,
  BITS_PER_SAMPLE: 16,
  MAX_CHARS_PER_REQUEST: 3500,
  CONCURRENT_REQUESTS: 3
};

// Audio Mixing Configuration
export const AUDIO = {
  MUSIC_VOLUME: 0.4,
  MUSIC_DUCK_VOLUME: 0.15,
  DUCK_RAMP_TIME: 0.3
};

// Storage Keys
export const STORAGE_KEYS = {
  API_KEY: 'apiKey',
  ENCRYPTION_KEY: 'gptcast-encryption-key',
  CURRENT_CONVERSATION: 'currentConversation',
  CURRENT_SCRIPT: 'currentScript',
  CURRENT_AUDIO: 'currentAudio',
  SETTINGS: 'settings'
};

// UI Configuration
export const UI = {
  POPUP_WIDTH: 360,
  MIN_HEIGHT: 400
};
