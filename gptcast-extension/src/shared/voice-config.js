/**
 * Voice configuration for Gemini TTS
 * Defines available voices and emotion mappings
 */

// Available Gemini TTS voices (prebuilt)
export const VOICES = {
  Puck: { name: 'Puck', style: 'Upbeat, energetic' },
  Kore: { name: 'Kore', style: 'Firm, authoritative' },
  Charon: { name: 'Charon', style: 'Warm, friendly' },
  Fenrir: { name: 'Fenrir', style: 'Deep, contemplative' },
  Aoede: { name: 'Aoede', style: 'Bright, cheerful' }
};

export const DEFAULT_VOICE = 'Puck';

// Emotion to TTS prompt mapping
export const EMOTION_PROMPTS = {
  excited: 'Say with high energy, enthusiasm, and genuine excitement',
  curious: 'Say with questioning intonation, wonder, and intrigue',
  thoughtful: 'Say slowly and reflectively, with pauses for emphasis',
  emphatic: 'Say with strong conviction, emphasis, and authority',
  warm: 'Say in a friendly, conversational, welcoming tone',
  neutral: 'Say clearly and naturally, like a professional narrator'
};

/**
 * Build TTS prompt with emotional direction
 */
export function buildTTSPrompt(text, emotion) {
  const emotionPrompt = EMOTION_PROMPTS[emotion] || EMOTION_PROMPTS.neutral;
  return `${emotionPrompt}: "${text}"`;
}

/**
 * Get voice options for UI dropdown
 */
export function getVoiceOptions() {
  return Object.entries(VOICES).map(([key, value]) => ({
    value: key,
    label: `${value.name} (${value.style})`
  }));
}
