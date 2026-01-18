/**
 * Gemini API Client
 * Handles text generation and TTS with retry logic and rate limiting
 */
import { API } from '../shared/constants.js';

export class GeminiClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.model = API.GEMINI_MODEL;
    this.maxRetries = API.MAX_RETRIES;
    this.retryDelay = API.RETRY_DELAY_MS;
  }

  /**
   * Generate text content using Gemini
   * Note: Google Gemini API requires key in URL query parameter (official API design)
   * https://ai.google.dev/gemini-api/docs/quickstart
   */
  async generateContent(prompt, options = {}) {
    const endpoint = `${API.GEMINI_BASE}/${this.model}:generateContent?key=${this.apiKey}`;

    const body = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        topK: options.topK ?? 40,
        topP: options.topP ?? 0.95,
        maxOutputTokens: options.maxTokens ?? 8192
      }
    };

    let lastError;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }, API.TIMEOUT_TEXT_MS);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          if (response.status === 429) {
            // Rate limited - exponential backoff
            await this.delay(Math.pow(2, attempt) * this.retryDelay);
            continue;
          }
          throw new Error(errorData.error?.message || `API error: ${response.status}`);
        }

        const data = await response.json();
        return this.parseTextResponse(data);
      } catch (error) {
        lastError = error;
        if (attempt < this.maxRetries - 1 && !error.message.includes('Invalid API key')) {
          await this.delay(Math.pow(2, attempt) * this.retryDelay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Generate TTS audio using Gemini
   */
  async generateTTS(text, options = {}) {
    const { voice = 'Puck', emotion = 'neutral' } = options;
    const prompt = this.buildTTSPrompt(text, emotion);

    const endpoint = `${API.GEMINI_BASE}/${this.model}:generateContent?key=${this.apiKey}`;

    const body = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voice
            }
          }
        }
      }
    };

    let lastError;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }, API.TIMEOUT_TTS_MS);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          if (response.status === 429) {
            await this.delay(Math.pow(2, attempt) * this.retryDelay);
            continue;
          }
          throw new Error(errorData.error?.message || `TTS error: ${response.status}`);
        }

        const data = await response.json();
        return this.parseTTSResponse(data);
      } catch (error) {
        lastError = error;
        if (attempt < this.maxRetries - 1) {
          await this.delay(Math.pow(2, attempt) * this.retryDelay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Test API key validity
   */
  async testApiKey() {
    try {
      await this.generateContent('Say "API key valid" in 3 words.', {
        maxTokens: 10,
        temperature: 0
      });
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Build TTS prompt with emotional direction
   */
  buildTTSPrompt(text, emotion) {
    const prompts = {
      excited: 'Say with high energy and genuine excitement',
      curious: 'Say with questioning intonation and wonder',
      thoughtful: 'Say slowly and reflectively',
      emphatic: 'Say with strong conviction and emphasis',
      warm: 'Say in a friendly, conversational tone',
      neutral: 'Say clearly and naturally'
    };

    const emotionPrompt = prompts[emotion] || prompts.neutral;
    return `${emotionPrompt}: "${text}"`;
  }

  /**
   * Parse text generation response
   */
  parseTextResponse(data) {
    const candidate = data.candidates?.[0];
    if (!candidate) {
      throw new Error('No response generated');
    }

    const text = candidate.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Empty response');
    }

    return {
      text,
      usageMetadata: data.usageMetadata,
      finishReason: candidate.finishReason
    };
  }

  /**
   * Parse TTS response
   */
  parseTTSResponse(data) {
    const candidate = data.candidates?.[0];
    if (!candidate) {
      throw new Error('No TTS response generated');
    }

    const audioPart = candidate.content?.parts?.find(
      p => p.inlineData?.mimeType?.startsWith('audio/')
    );

    if (!audioPart) {
      throw new Error('No audio in response');
    }

    return {
      audioData: audioPart.inlineData.data,
      mimeType: audioPart.inlineData.mimeType,
      usageMetadata: data.usageMetadata
    };
  }

  /**
   * Fetch with timeout
   */
  async fetchWithTimeout(url, options, timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
