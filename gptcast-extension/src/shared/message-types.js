/**
 * Message types for inter-component communication
 * Used between: popup <-> service worker <-> content script <-> offscreen
 */
export const MSG = {
  // Conversation extraction
  EXTRACT_CONVERSATION: 'extract_conversation',
  CONVERSATION_DATA: 'conversation_data',

  // Script generation
  GENERATE_SCRIPT: 'generate_script',
  SCRIPT_READY: 'script_ready',

  // TTS generation
  GENERATE_TTS: 'generate_tts',
  TTS_CHUNK_READY: 'tts_chunk_ready',

  // Audio mixing
  MIX_AUDIO: 'mix_audio',
  MIX_AUDIO_OFFSCREEN: 'mix_audio_offscreen',  // Internal: SW -> offscreen
  OFFSCREEN_READY: 'offscreen_ready',  // Offscreen -> SW: document ready
  AUDIO_READY: 'audio_ready',

  // Full pipeline
  GENERATE_PODCAST: 'generate_podcast',
  DOWNLOAD_AUDIO: 'download_audio',

  // Progress & status
  PROGRESS_UPDATE: 'progress_update',
  ERROR: 'error',

  // Settings
  TEST_API_KEY: 'test_api_key'
};
