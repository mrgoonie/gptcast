/**
 * Voice Configuration Tests
 * Tests for voice configuration and emotion mappings
 */

import {
  VOICES,
  DEFAULT_VOICE,
  EMOTION_PROMPTS,
  buildTTSPrompt,
  getVoiceOptions
} from '../voice-config.js';

describe('Voice Configuration', () => {
  describe('VOICES constant', () => {
    it('should have all required voice names', () => {
      expect(VOICES).toHaveProperty('Puck');
      expect(VOICES).toHaveProperty('Kore');
      expect(VOICES).toHaveProperty('Charon');
      expect(VOICES).toHaveProperty('Fenrir');
      expect(VOICES).toHaveProperty('Aoede');
    });

    it('should have name and style properties for each voice', () => {
      Object.values(VOICES).forEach(voice => {
        expect(voice).toHaveProperty('name');
        expect(voice).toHaveProperty('style');
        expect(typeof voice.name).toBe('string');
        expect(typeof voice.style).toBe('string');
        expect(voice.name.length).toBeGreaterThan(0);
        expect(voice.style.length).toBeGreaterThan(0);
      });
    });
  });

  describe('DEFAULT_VOICE constant', () => {
    it('should be set to Puck', () => {
      expect(DEFAULT_VOICE).toBe('Puck');
    });

    it('should be a valid voice name', () => {
      expect(VOICES).toHaveProperty(DEFAULT_VOICE);
    });
  });

  describe('EMOTION_PROMPTS constant', () => {
    it('should have all required emotion prompts', () => {
      expect(EMOTION_PROMPTS).toHaveProperty('excited');
      expect(EMOTION_PROMPTS).toHaveProperty('curious');
      expect(EMOTION_PROMPTS).toHaveProperty('thoughtful');
      expect(EMOTION_PROMPTS).toHaveProperty('emphatic');
      expect(EMOTION_PROMPTS).toHaveProperty('warm');
      expect(EMOTION_PROMPTS).toHaveProperty('neutral');
    });

    it('should have non-empty prompts for each emotion', () => {
      Object.values(EMOTION_PROMPTS).forEach(prompt => {
        expect(typeof prompt).toBe('string');
        expect(prompt.length).toBeGreaterThan(0);
      });
    });
  });

  describe('buildTTSPrompt function', () => {
    it('should build prompt with known emotion', () => {
      const result = buildTTSPrompt('Hello world', 'excited');
      expect(result).toContain('Say with high energy');
      expect(result).toContain('Hello world');
      expect(result).toContain('"');
    });

    it('should build prompt with unknown emotion using neutral default', () => {
      const result = buildTTSPrompt('Hello world', 'unknown_emotion');
      expect(result).toContain('Say clearly and naturally');
      expect(result).toContain('Hello world');
    });

    it('should use neutral emotion when no emotion provided', () => {
      const result = buildTTSPrompt('Test text');
      expect(result).toContain('Say clearly and naturally');
      expect(result).toContain('Test text');
    });

    it('should handle all valid emotions', () => {
      const emotions = ['excited', 'curious', 'thoughtful', 'emphatic', 'warm', 'neutral'];
      emotions.forEach(emotion => {
        const result = buildTTSPrompt('Sample text', emotion);
        expect(result).toContain('"Sample text"');
        expect(result.length).toBeGreaterThan(0);
      });
    });

    it('should include text in quotes', () => {
      const result = buildTTSPrompt('My text', 'warm');
      expect(result).toMatch(/"My text"/);
    });

    it('should handle empty text', () => {
      const result = buildTTSPrompt('', 'neutral');
      expect(result).toContain('""');
    });

    it('should handle text with special characters', () => {
      const specialText = 'Hello! How are you? I\'m fine.';
      const result = buildTTSPrompt(specialText, 'curious');
      expect(result).toContain(specialText);
    });
  });

  describe('getVoiceOptions function', () => {
    it('should return an array', () => {
      const options = getVoiceOptions();
      expect(Array.isArray(options)).toBe(true);
    });

    it('should return array with 5 options', () => {
      const options = getVoiceOptions();
      expect(options.length).toBe(5);
    });

    it('should have value and label properties for each option', () => {
      const options = getVoiceOptions();
      options.forEach(option => {
        expect(option).toHaveProperty('value');
        expect(option).toHaveProperty('label');
        expect(typeof option.value).toBe('string');
        expect(typeof option.label).toBe('string');
      });
    });

    it('should have all voice names as values', () => {
      const options = getVoiceOptions();
      const values = options.map(o => o.value);
      expect(values).toContain('Puck');
      expect(values).toContain('Kore');
      expect(values).toContain('Charon');
      expect(values).toContain('Fenrir');
      expect(values).toContain('Aoede');
    });

    it('should include voice style in label', () => {
      const options = getVoiceOptions();
      const puckOption = options.find(o => o.value === 'Puck');
      expect(puckOption.label).toContain('Puck');
      expect(puckOption.label).toContain('Upbeat, energetic');
    });

    it('should format labels correctly', () => {
      const options = getVoiceOptions();
      options.forEach(option => {
        expect(option.label).toMatch(/\([^)]+\)$/);
      });
    });
  });
});
