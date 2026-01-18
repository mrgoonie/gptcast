/**
 * Script Generator
 * Transforms conversation data into podcast scripts using Gemini LLM
 */
import { GeminiClient } from './gemini-client.js';
import { buildPrompt, estimateTokens } from '../shared/prompts.js';
import { API } from '../shared/constants.js';

export class ScriptGenerator {
  constructor(apiKey) {
    this.client = new GeminiClient(apiKey);
    this.maxTokensPerChunk = API.MAX_TOKENS_PER_CHUNK;
  }

  /**
   * Generate podcast script from conversation
   */
  async generate(conversation, options = {}) {
    const { condensed = false, onProgress } = options;

    // Validate conversation data
    if (!conversation?.messages?.length) {
      throw new Error('Invalid conversation: no messages found');
    }

    // Check if conversation needs chunking
    const conversationText = conversation.messages
      .map(m => m.content)
      .join(' ');
    const estimatedTokens = estimateTokens(conversationText);

    if (estimatedTokens > API.MAX_TOKENS_BEFORE_CHUNKING) {
      return this.generateChunked(conversation, options);
    }

    onProgress?.({ stage: 'generating', progress: 10, detail: 'Creating podcast script...' });

    const prompt = buildPrompt(conversation, condensed);
    const result = await this.client.generateContent(prompt, {
      temperature: 0.7,
      maxTokens: 8192
    });

    onProgress?.({ stage: 'processing', progress: 90, detail: 'Parsing script...' });

    const script = this.parseScript(result.text);

    return {
      script,
      metadata: {
        inputTokens: result.usageMetadata?.promptTokenCount,
        outputTokens: result.usageMetadata?.candidatesTokenCount,
        conversationTitle: conversation.title,
        condensed
      }
    };
  }

  /**
   * Generate script for long conversations in chunks
   */
  async generateChunked(conversation, options) {
    const { onProgress } = options;
    const chunks = this.chunkConversation(conversation, this.maxTokensPerChunk);
    const scripts = [];

    for (let i = 0; i < chunks.length; i++) {
      onProgress?.({
        stage: 'generating',
        progress: Math.round((i / chunks.length) * 80),
        detail: `Processing part ${i + 1} of ${chunks.length}`
      });

      const chunkPrompt = this.buildChunkPrompt(chunks[i], i, chunks.length);
      const result = await this.client.generateContent(chunkPrompt, {
        temperature: 0.7,
        maxTokens: 4096
      });
      scripts.push(result.text);
    }

    // Merge scripts with pauses
    onProgress?.({ stage: 'merging', progress: 90, detail: 'Combining segments...' });
    const merged = this.mergeScripts(scripts);

    return {
      script: this.parseScript(merged),
      metadata: {
        chunks: chunks.length,
        conversationTitle: conversation.title
      }
    };
  }

  /**
   * Split conversation into chunks
   */
  chunkConversation(conversation, maxTokensPerChunk) {
    const chunks = [];
    let currentChunk = { ...conversation, messages: [] };
    let currentTokens = 0;

    for (const message of conversation.messages) {
      const messageTokens = estimateTokens(message.content);

      if (currentTokens + messageTokens > maxTokensPerChunk && currentChunk.messages.length > 0) {
        chunks.push(currentChunk);
        currentChunk = { ...conversation, messages: [] };
        currentTokens = 0;
      }

      currentChunk.messages.push(message);
      currentTokens += messageTokens;
    }

    if (currentChunk.messages.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  /**
   * Build prompt for a specific chunk
   */
  buildChunkPrompt(chunk, index, total) {
    const position = index === 0 ? 'OPENING' :
                     index === total - 1 ? 'CLOSING' : 'MIDDLE';

    const formatted = chunk.messages
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n');

    return `
You are writing PART ${index + 1} of ${total} of a podcast script.
This is the ${position} segment.

${index === 0 ? 'Include a hook and introduction.' : ''}
${index === total - 1 ? 'Include takeaways and closing.' : ''}
${index > 0 && index < total - 1 ? 'This is a continuation - maintain flow.' : ''}

Use emotion markers: [HOST/EXCITED], [HOST/CURIOUS], [HOST/EMPHATIC], [HOST/THOUGHTFUL], [HOST/WARM], [PAUSE:X]

CONVERSATION SEGMENT:
${formatted}

OUTPUT: Podcast script segment
`;
  }

  /**
   * Merge multiple script segments
   */
  mergeScripts(scripts) {
    return scripts.join('\n\n[PAUSE:1]\n\n');
  }

  /**
   * Parse script text into structured segments
   */
  parseScript(text) {
    const segments = [];
    const lines = text.split('\n').filter(line => line.trim());

    for (const line of lines) {
      const trimmed = line.trim();

      // Check for pause marker
      const pauseMatch = trimmed.match(/\[PAUSE:(\d+(?:\.\d+)?)\]/i);
      if (pauseMatch) {
        segments.push({
          type: 'pause',
          duration: parseFloat(pauseMatch[1])
        });
        continue;
      }

      // Check for speech with emotion
      const speechMatch = trimmed.match(/^\[HOST\/(\w+)\]:?\s*(.+)$/i);
      if (speechMatch) {
        segments.push({
          type: 'speech',
          emotion: speechMatch[1].toLowerCase(),
          text: speechMatch[2].trim()
        });
        continue;
      }

      // Plain text (treat as neutral speech)
      if (trimmed && !trimmed.startsWith('[')) {
        segments.push({
          type: 'speech',
          emotion: 'neutral',
          text: trimmed
        });
      }
    }

    return {
      raw: text,
      segments,
      segmentCount: segments.length,
      speechCount: segments.filter(s => s.type === 'speech').length,
      pauseCount: segments.filter(s => s.type === 'pause').length
    };
  }
}
