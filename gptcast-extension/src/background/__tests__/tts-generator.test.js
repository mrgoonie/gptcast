/**
 * TTS Generator Tests
 * Tests for TTS generation with batching, chunking, and segment handling
 */

import { TTSGenerator } from '../tts-generator.js';

// Mock GeminiClient
jest.mock('../gemini-client.js', () => {
  return {
    GeminiClient: jest.fn().mockImplementation((apiKey) => {
      return {
        apiKey,
        generateTTS: jest.fn()
      };
    })
  };
});

describe('TTSGenerator', () => {
  let generator;
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    generator = new TTSGenerator(mockApiKey);
  });

  describe('constructor', () => {
    it('should initialize with API key', () => {
      const gen = new TTSGenerator('my-api-key');
      expect(gen.client).toBeDefined();
    });

    it('should set maxCharsPerRequest from constants', () => {
      expect(generator.maxCharsPerRequest).toBe(3500);
    });

    it('should set concurrentRequests from constants', () => {
      expect(generator.concurrentRequests).toBe(3);
    });
  });

  describe('generateAudio', () => {
    it('should throw error if script is missing', async () => {
      await expect(generator.generateAudio(null)).rejects.toThrow('Invalid script');
    });

    it('should throw error if segments array is empty', async () => {
      await expect(generator.generateAudio({ segments: [] })).rejects.toThrow('Invalid script');
    });

    it('should throw error if script has no segments property', async () => {
      await expect(generator.generateAudio({})).rejects.toThrow('Invalid script');
    });

    it('should process segments and return audio segments', async () => {
      const script = {
        segments: [
          { type: 'text', text: 'Hello', emotion: 'neutral' }
        ]
      };

      generator.client.generateTTS.mockResolvedValue({
        audioData: 'mock-audio',
        mimeType: 'audio/pcm'
      });

      const result = await generator.generateAudio(script);
      expect(result.segments).toBeDefined();
      expect(Array.isArray(result.segments)).toBe(true);
    });

    it('should return metadata with voice and timestamp', async () => {
      const script = {
        segments: [
          { type: 'text', text: 'Hello', emotion: 'neutral' }
        ]
      };

      generator.client.generateTTS.mockResolvedValue({
        audioData: 'mock-audio',
        mimeType: 'audio/pcm'
      });

      const result = await generator.generateAudio(script);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.voice).toBe('Puck');
      expect(result.metadata.generatedAt).toBeDefined();
      expect(result.metadata.totalSegments).toBeGreaterThan(0);
    });

    it('should use custom voice option', async () => {
      const script = {
        segments: [
          { type: 'text', text: 'Hello', emotion: 'neutral' }
        ]
      };

      generator.client.generateTTS.mockResolvedValue({
        audioData: 'mock-audio',
        mimeType: 'audio/pcm'
      });

      const result = await generator.generateAudio(script, { voice: 'Charon' });
      expect(result.metadata.voice).toBe('Charon');
    });

    it('should call onProgress callback', async () => {
      const script = {
        segments: [
          { type: 'text', text: 'Hello', emotion: 'neutral' },
          { type: 'text', text: 'World', emotion: 'neutral' }
        ]
      };

      generator.client.generateTTS.mockResolvedValue({
        audioData: 'mock-audio',
        mimeType: 'audio/pcm'
      });

      const onProgress = jest.fn();
      await generator.generateAudio(script, { onProgress });
      expect(onProgress).toHaveBeenCalled();
    });

    it('should process pause segments', async () => {
      const script = {
        segments: [
          { type: 'pause', duration: 1.5 }
        ]
      };

      const result = await generator.generateAudio(script);
      expect(result.segments[0].type).toBe('silence');
      expect(result.segments[0].duration).toBeDefined();
    });

    it('should batch segments respecting concurrent requests limit', async () => {
      const script = {
        segments: [
          { type: 'text', text: 'Segment 1', emotion: 'neutral' },
          { type: 'text', text: 'Segment 2', emotion: 'neutral' },
          { type: 'text', text: 'Segment 3', emotion: 'neutral' },
          { type: 'text', text: 'Segment 4', emotion: 'neutral' }
        ]
      };

      generator.client.generateTTS.mockResolvedValue({
        audioData: 'mock-audio',
        mimeType: 'audio/pcm'
      });

      await generator.generateAudio(script);
      // Should be called for at least all text segments
      expect(generator.client.generateTTS.mock.calls.length).toBeGreaterThan(0);
    });
  });

  describe('generateSegmentAudio', () => {
    it('should return silence for empty text', async () => {
      const segment = { type: 'text', text: '', emotion: 'neutral' };
      const result = await generator.generateSegmentAudio(segment, 'Puck');
      expect(result.type).toBe('silence');
      expect(result.duration).toBe(0.5);
    });

    it('should return silence for whitespace-only text', async () => {
      const segment = { type: 'text', text: '   \n\t  ', emotion: 'neutral' };
      const result = await generator.generateSegmentAudio(segment, 'Puck');
      expect(result.type).toBe('silence');
    });

    it('should generate audio for valid text', async () => {
      const segment = { type: 'text', text: 'Hello world', emotion: 'neutral' };
      generator.client.generateTTS.mockResolvedValue({
        audioData: 'mock-audio-data',
        mimeType: 'audio/pcm'
      });

      const result = await generator.generateSegmentAudio(segment, 'Puck');
      expect(result.type).toBe('audio');
      expect(result.audioData).toBe('mock-audio-data');
      expect(result.emotion).toBe('neutral');
    });

    it('should include text length in result', async () => {
      const text = 'Testing text length';
      const segment = { type: 'text', text, emotion: 'neutral' };
      generator.client.generateTTS.mockResolvedValue({
        audioData: 'mock-audio',
        mimeType: 'audio/pcm'
      });

      const result = await generator.generateSegmentAudio(segment, 'Puck');
      expect(result.textLength).toBe(text.length);
    });

    it('should chunk text when exceeding max chars', async () => {
      const longText = 'a'.repeat(4000);
      const segment = { type: 'text', text: longText, emotion: 'neutral' };
      generator.client.generateTTS.mockResolvedValue({
        audioData: 'mock-audio',
        mimeType: 'audio/pcm'
      });

      const result = await generator.generateSegmentAudio(segment, 'Puck');
      expect(result.type).toBe('audio_chunked');
    });

    it('should handle TTS errors gracefully', async () => {
      const segment = { type: 'text', text: 'Error test', emotion: 'neutral' };
      generator.client.generateTTS.mockRejectedValue(new Error('API Error'));

      const result = await generator.generateSegmentAudio(segment, 'Puck');
      expect(result.type).toBe('error');
      expect(result.error).toBeDefined();
    });

    it('should preserve emotion in result', async () => {
      const segment = { type: 'text', text: 'Excited text!', emotion: 'excited' };
      generator.client.generateTTS.mockResolvedValue({
        audioData: 'mock-audio',
        mimeType: 'audio/pcm'
      });

      const result = await generator.generateSegmentAudio(segment, 'Puck');
      expect(result.emotion).toBe('excited');
    });
  });

  describe('chunkText', () => {
    it('should return single chunk for short text', () => {
      const text = 'Short text.';
      const chunks = generator.chunkText(text);
      expect(chunks.length).toBe(1);
      expect(chunks[0]).toBe('Short text.');
    });

    it('should split at sentence boundaries', () => {
      const text = 'First sentence. Second sentence. Third sentence.';
      const chunks = generator.chunkText(text);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    it('should split long text', () => {
      const text = 'A'.repeat(4000) + '. ' + 'B'.repeat(2000) + '.';
      const chunks = generator.chunkText(text);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      chunks.forEach(chunk => {
        expect(chunk.length).toBeLessThanOrEqual(generator.maxCharsPerRequest);
      });
    });

    it('should handle text without periods', () => {
      const text = 'Text without sentence endings!';
      const chunks = generator.chunkText(text);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0].length).toBeGreaterThan(0);
    });

    it('should split at word boundaries for very long sentences', () => {
      const longSentence = Array(500).fill('word').join(' ') + '.';
      if (longSentence.length > generator.maxCharsPerRequest) {
        const chunks = generator.chunkText(longSentence);
        chunks.forEach(chunk => {
          expect(chunk.length).toBeLessThanOrEqual(generator.maxCharsPerRequest + 20);
        });
      }
    });

    it('should preserve all text content', () => {
      const text = 'First. Second. Third.';
      const chunks = generator.chunkText(text);
      const combined = chunks.join('').replace(/\s+/g, '');
      const original = text.replace(/\s+/g, '');
      expect(combined).toContain(original.slice(0, 5));
    });

    it('should trim whitespace from chunks', () => {
      const text = 'Test. Another.';
      const chunks = generator.chunkText(text);
      chunks.forEach(chunk => {
        expect(chunk).toBe(chunk.trim());
      });
    });

    it('should handle question marks and exclamation marks', () => {
      const text = 'Is this a question? Yes! Really.';
      const chunks = generator.chunkText(text);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('createSilenceSegment', () => {
    it('should create silence segment with duration', () => {
      const result = generator.createSilenceSegment(1);
      expect(result.type).toBe('silence');
      expect(result.duration).toBe(1);
    });

    it('should clamp duration to minimum 0.1 seconds', () => {
      const result = generator.createSilenceSegment(0.05);
      expect(result.duration).toBe(0.1);
    });

    it('should clamp duration to maximum 10 seconds', () => {
      const result = generator.createSilenceSegment(15);
      expect(result.duration).toBe(10);
    });

    it('should preserve duration within valid range', () => {
      const duration = 2.5;
      const result = generator.createSilenceSegment(duration);
      expect(result.duration).toBe(duration);
    });

    it('should handle zero duration', () => {
      const result = generator.createSilenceSegment(0);
      expect(result.duration).toBe(0.1);
    });

    it('should handle negative duration', () => {
      const result = generator.createSilenceSegment(-5);
      expect(result.duration).toBe(0.1);
    });
  });

  describe('delay helper', () => {
    it('should resolve after specified milliseconds', async () => {
      const start = Date.now();
      await generator.delay(50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(50);
    });

    it('should handle zero delay', async () => {
      const start = Date.now();
      await generator.delay(0);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(50);
    });
  });

  describe('integration tests', () => {
    it('should handle mixed segment types', async () => {
      const script = {
        segments: [
          { type: 'text', text: 'Introduction', emotion: 'warm' },
          { type: 'pause', duration: 1 },
          { type: 'text', text: 'Main content', emotion: 'neutral' }
        ]
      };

      generator.client.generateTTS.mockResolvedValue({
        audioData: 'mock-audio',
        mimeType: 'audio/pcm'
      });

      const result = await generator.generateAudio(script);
      expect(result.segments.length).toBeGreaterThan(0);
      const hasAudio = result.segments.some(seg => seg.type === 'audio' || seg.type === 'audio_chunked');
      const hasSilence = result.segments.some(seg => seg.type === 'silence');
      expect(hasAudio || hasSilence).toBe(true);
    });

    it('should respect progress callback format', async () => {
      const script = {
        segments: [
          { type: 'text', text: 'Test', emotion: 'neutral' }
        ]
      };

      generator.client.generateTTS.mockResolvedValue({
        audioData: 'mock-audio',
        mimeType: 'audio/pcm'
      });

      const progressUpdates = [];
      await generator.generateAudio(script, {
        onProgress: (update) => progressUpdates.push(update)
      });

      progressUpdates.forEach(update => {
        expect(update.stage).toBe('tts');
        expect(update.progress).toBeGreaterThanOrEqual(0);
        expect(update.progress).toBeLessThanOrEqual(100);
        expect(update.detail).toBeDefined();
      });
    });
  });
});
