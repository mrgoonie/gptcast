/**
 * TTS Generator
 * Converts podcast script segments to audio using Gemini TTS
 */
import { GeminiClient } from './gemini-client.js';
import { DEFAULT_VOICE } from '../shared/voice-config.js';
import { TTS } from '../shared/constants.js';

export class TTSGenerator {
  constructor(apiKey) {
    this.client = new GeminiClient(apiKey);
    this.maxCharsPerRequest = TTS.MAX_CHARS_PER_REQUEST;
    this.concurrentRequests = TTS.CONCURRENT_REQUESTS;
  }

  /**
   * Generate audio for all script segments
   */
  async generateAudio(script, options = {}) {
    const { voice = DEFAULT_VOICE, onProgress } = options;

    if (!script?.segments?.length) {
      throw new Error('Invalid script: no segments found');
    }

    const audioSegments = [];
    const segments = script.segments;
    const totalSegments = segments.length;

    // Process segments in batches to respect rate limits
    for (let i = 0; i < segments.length; i += this.concurrentRequests) {
      const batch = segments.slice(i, i + this.concurrentRequests);

      const batchPromises = batch.map(async (segment, batchIndex) => {
        const segmentIndex = i + batchIndex;

        try {
          onProgress?.({
            stage: 'tts',
            progress: Math.round((segmentIndex / totalSegments) * 100),
            detail: `Generating audio ${segmentIndex + 1}/${totalSegments}`
          });
        } catch {
          // Progress callback failed, continue processing
        }

        if (segment.type === 'pause') {
          return this.createSilenceSegment(segment.duration);
        }

        return this.generateSegmentAudio(segment, voice);
      });

      const batchResults = await Promise.all(batchPromises);
      audioSegments.push(...batchResults);

      // Delay between batches to avoid rate limiting
      if (i + this.concurrentRequests < segments.length) {
        await this.delay(500);
      }
    }

    return {
      segments: audioSegments,
      metadata: {
        totalSegments: audioSegments.length,
        voice,
        generatedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Generate audio for a single segment
   */
  async generateSegmentAudio(segment, voice) {
    const { emotion, text } = segment;

    if (!text || text.trim().length === 0) {
      return {
        type: 'silence',
        duration: 0.5
      };
    }

    // Chunk long text if needed
    if (text.length > this.maxCharsPerRequest) {
      return this.generateChunkedAudio(text, emotion, voice);
    }

    try {
      const result = await this.client.generateTTS(text, { voice, emotion });

      return {
        type: 'audio',
        audioData: result.audioData,
        mimeType: result.mimeType,
        emotion,
        textLength: text.length
      };
    } catch (error) {
      console.error(`[GPTCast] TTS error for segment:`, error);

      // Return error marker for failed segment
      return {
        type: 'error',
        error: error.message,
        text: text.slice(0, 50),
        emotion
      };
    }
  }

  /**
   * Generate audio for text longer than max chars
   */
  async generateChunkedAudio(text, emotion, voice) {
    const chunks = this.chunkText(text);
    const audioChunks = [];

    for (const chunk of chunks) {
      try {
        const result = await this.client.generateTTS(chunk, { voice, emotion });
        audioChunks.push(result.audioData);
        await this.delay(300);
      } catch (error) {
        console.error(`[GPTCast] TTS chunk error:`, error);
        // Skip failed chunks
      }
    }

    if (audioChunks.length === 0) {
      return {
        type: 'error',
        error: 'All chunks failed',
        emotion
      };
    }

    return {
      type: 'audio_chunked',
      audioChunks,
      mimeType: 'audio/pcm',
      emotion,
      chunkCount: audioChunks.length
    };
  }

  /**
   * Split text into chunks at sentence boundaries
   */
  chunkText(text) {
    const chunks = [];
    // Match sentences ending with .!? followed by space or end
    const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];

    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > this.maxCharsPerRequest) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        // Handle single sentence longer than max
        if (sentence.length > this.maxCharsPerRequest) {
          // Split at word boundaries
          const words = sentence.split(' ');
          let wordChunk = '';
          for (const word of words) {
            // Hard truncate oversized single words
            const safeWord = word.length > this.maxCharsPerRequest
              ? word.slice(0, this.maxCharsPerRequest)
              : word;
            if ((wordChunk + ' ' + safeWord).length > this.maxCharsPerRequest) {
              if (wordChunk) chunks.push(wordChunk.trim());
              wordChunk = safeWord;
            } else {
              wordChunk += (wordChunk ? ' ' : '') + safeWord;
            }
          }
          if (wordChunk) currentChunk = wordChunk;
        } else {
          currentChunk = sentence;
        }
      } else {
        currentChunk += sentence;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Create a silence segment marker
   */
  createSilenceSegment(duration) {
    return {
      type: 'silence',
      duration: Math.max(0.1, Math.min(duration, 10)) // Clamp 0.1-10s
    };
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
