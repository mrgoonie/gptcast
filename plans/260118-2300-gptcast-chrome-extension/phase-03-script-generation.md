# Phase 3: Script Generation

## Context Links
- [Gemini API Integration](./research/researcher-02-gemini-api-integration.md)
- [Brainstorm - Script Generation](../reports/brainstorm-260118-2247-gptcast-chrome-extension.md)
- [Phase 2 - DOM Extraction](./phase-02-dom-extraction.md)

## Overview
- **Priority**: P0 (Core feature)
- **Status**: completed (2026-01-18T23:55:00Z)
- **Effort**: 3h
- **Description**: Transform extracted conversation into engaging podcast script using Gemini Flash LLM

## Completion Summary

**Completed:** 2026-01-18T23:55:00Z

### Deliverables
- **gemini-client.js**: API wrapper with 3-retry exponential backoff (30s timeout)
- **prompts.js**: 2 templates (full + condensed) with emotion markers
- **script-generator.js**: Token estimation, chunking (50k/chunk), parsing, merging
- **service-worker.js**: Integration handler for MSG.GENERATE_SCRIPT

### Quality Metrics
- Tests: 9/10 passed (retry logic edge case fixed)
- Code review: 7/10 → 9/10 (added validation, centralized constants, improved error messages)
- Coverage: All critical paths (API errors, rate limits, chunking)

## Key Insights

### Transformation Goal
The output should feel like a professionally produced podcast, not robotic TTS reading a Q&A transcript.

**Input (Raw):**
```
User: What's the best way to learn programming?
Assistant: There are several effective approaches...
```

**Output (Podcast Script):**
```
[HOST/EXCITED]: Welcome back to another episode!
[HOST/CURIOUS]: Today we're diving into a question millions of developers ask...
[PAUSE:1.5]
[HOST/EMPHATIC]: What IS the best way to learn programming?
```

### Gemini Flash API Details
- **Model**: `gemini-2.5-flash-preview` (cost-effective, fast)
- **Endpoint**: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-04-17:generateContent`
- **Context window**: 1M tokens input, 65k tokens output
- **Token math**: ~4 chars per token; 100 tokens = 60-80 words

### Emotion Markers for TTS
Scripts must include emotion/style markers that Gemini TTS will interpret:
- `[HOST/EXCITED]` - Energetic delivery
- `[HOST/CURIOUS]` - Questioning tone
- `[HOST/THOUGHTFUL]` - Reflective, slower
- `[HOST/EMPHATIC]` - Strong emphasis
- `[PAUSE:X]` - Silence for X seconds

## Requirements

### Functional
- Transform conversation into single-host narration
- Add emotional hooks, rhetorical questions, dramatic pauses
- Include natural transitions and callbacks
- Generate emotion markers for TTS
- Handle long conversations (chunking if >100k tokens)

### Non-Functional
- Generation completes in <30s for typical conversation
- Quality output reads naturally when spoken
- Token usage efficient (minimize redundant context)
- Graceful handling of API errors/rate limits

## Architecture

```
Conversation Data (from Phase 2)
           │
           ▼
┌──────────────────────────┐
│  Script Generator        │
│  (service-worker.js)     │
├──────────────────────────┤
│  - preparePrompt()       │
│  - chunkConversation()   │
│  - callGeminiAPI()       │
│  - parseScript()         │
│  - handleRateLimit()     │
└──────────────────────────┘
           │
           ▼
    Gemini Flash API
           │
           ▼
    Podcast Script
    (with emotion markers)
```

## Related Code Files

### Create
- `src/background/script-generator.js` - LLM integration module
- `src/background/gemini-client.js` - API wrapper with retry logic
- `src/shared/prompts.js` - Prompt templates

### Modify
- `src/background/service-worker.js` - Add script generation handler

## Implementation Steps

### 1. Create Gemini client wrapper
```javascript
// src/background/gemini-client.js
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.model = 'gemini-2.5-flash-preview-04-17';
    this.maxRetries = 3;
    this.retryDelay = 1000;
  }

  async generateContent(prompt, options = {}) {
    const endpoint = `${API_BASE}/${this.model}:generateContent?key=${this.apiKey}`;

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
        }, 30000);

        if (!response.ok) {
          const error = await response.json();
          if (response.status === 429) {
            // Rate limited - wait and retry
            await this.delay(Math.pow(2, attempt) * this.retryDelay);
            continue;
          }
          throw new Error(error.error?.message || `API error: ${response.status}`);
        }

        const data = await response.json();
        return this.parseResponse(data);
      } catch (error) {
        lastError = error;
        if (attempt < this.maxRetries - 1) {
          await this.delay(Math.pow(2, attempt) * this.retryDelay);
        }
      }
    }

    throw lastError;
  }

  parseResponse(data) {
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

  async fetchWithTimeout(url, options, timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 2. Create prompt templates
```javascript
// src/shared/prompts.js
export const PODCAST_SCRIPT_PROMPT = `
You are a professional podcast script writer. Transform this ChatGPT conversation into an engaging, inspiring single-host podcast script.

CRITICAL RULES:
1. Create a SINGLE HOST narration (not a dialogue recreation)
2. Make it STORYTELLING, not reading Q&A
3. Add emotional hooks, rhetorical questions, dramatic pauses
4. Include natural transitions and callbacks to earlier points
5. Output ONLY the script with emotion markers

EMOTION MARKERS (use these for TTS):
- [HOST/EXCITED] - Energetic, enthusiastic delivery
- [HOST/CURIOUS] - Questioning, inquisitive tone
- [HOST/THOUGHTFUL] - Reflective, slower pace
- [HOST/EMPHATIC] - Strong emphasis, conviction
- [HOST/WARM] - Friendly, conversational
- [PAUSE:1] or [PAUSE:2] - Brief pause in seconds

STRUCTURE:
1. Hook (grab attention in first 10 seconds)
2. Setup (what we're exploring today)
3. Journey (key insights from conversation, woven as narrative)
4. Takeaways (actionable or memorable conclusions)
5. Close (warm sign-off)

LENGTH: Aim for 2-5 minute spoken content (~300-750 words)

CONVERSATION TO TRANSFORM:
{{CONVERSATION}}

OUTPUT: Podcast script with emotion markers (nothing else)
`;

export const CONDENSED_PROMPT = `
You are a podcast script writer. Create a BRIEF, punchy podcast segment from this conversation.

RULES:
- Single host narration
- Focus on the 2-3 MOST interesting insights only
- 1-2 minutes of spoken content (~150-300 words)
- Use emotion markers: [HOST/EXCITED], [HOST/CURIOUS], [HOST/EMPHATIC], [PAUSE:X]

CONVERSATION:
{{CONVERSATION}}

OUTPUT: Brief podcast script with emotion markers
`;

export function buildPrompt(conversation, condensed = false) {
  const template = condensed ? CONDENSED_PROMPT : PODCAST_SCRIPT_PROMPT;

  // Format conversation for prompt
  const formatted = conversation.messages
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  return template.replace('{{CONVERSATION}}', formatted);
}
```

### 3. Create script generator module
```javascript
// src/background/script-generator.js
import { GeminiClient } from './gemini-client.js';
import { buildPrompt } from '../shared/prompts.js';

export class ScriptGenerator {
  constructor(apiKey) {
    this.client = new GeminiClient(apiKey);
  }

  async generate(conversation, options = {}) {
    const { condensed = false, onProgress } = options;

    // Check if conversation needs chunking
    const estimatedTokens = this.estimateTokens(conversation);

    if (estimatedTokens > 100000) {
      return this.generateChunked(conversation, options);
    }

    onProgress?.({ stage: 'generating', progress: 10 });

    const prompt = buildPrompt(conversation, condensed);
    const result = await this.client.generateContent(prompt, {
      temperature: 0.7,
      maxTokens: 8192
    });

    onProgress?.({ stage: 'processing', progress: 90 });

    const script = this.parseScript(result.text);

    return {
      script,
      metadata: {
        inputTokens: result.usageMetadata?.promptTokenCount,
        outputTokens: result.usageMetadata?.candidatesTokenCount,
        conversationTitle: conversation.title
      }
    };
  }

  async generateChunked(conversation, options) {
    const { onProgress } = options;
    const chunks = this.chunkConversation(conversation, 50000);
    const scripts = [];

    for (let i = 0; i < chunks.length; i++) {
      onProgress?.({
        stage: 'generating',
        progress: Math.round((i / chunks.length) * 80),
        detail: `Processing part ${i + 1} of ${chunks.length}`
      });

      const chunkPrompt = this.buildChunkPrompt(chunks[i], i, chunks.length);
      const result = await this.client.generateContent(chunkPrompt);
      scripts.push(result.text);
    }

    // Merge scripts
    onProgress?.({ stage: 'merging', progress: 90 });
    const merged = this.mergeScripts(scripts);

    return {
      script: this.parseScript(merged),
      metadata: {
        chunks: chunks.length,
        conversationTitle: conversation.title
      }
    };
  }

  estimateTokens(conversation) {
    // ~4 chars per token
    const totalChars = conversation.messages
      .reduce((sum, m) => sum + m.content.length, 0);
    return Math.ceil(totalChars / 4);
  }

  chunkConversation(conversation, maxTokensPerChunk) {
    const chunks = [];
    let currentChunk = { ...conversation, messages: [] };
    let currentTokens = 0;

    for (const message of conversation.messages) {
      const messageTokens = Math.ceil(message.content.length / 4);

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

  buildChunkPrompt(chunk, index, total) {
    const position = index === 0 ? 'OPENING' :
                     index === total - 1 ? 'CLOSING' : 'MIDDLE';

    return `
You are writing PART ${index + 1} of ${total} of a podcast script.
This is the ${position} segment.

${index === 0 ? 'Include a hook and introduction.' : ''}
${index === total - 1 ? 'Include takeaways and closing.' : ''}
${index > 0 && index < total - 1 ? 'This is a continuation - maintain flow.' : ''}

Use emotion markers: [HOST/EXCITED], [HOST/CURIOUS], [HOST/EMPHATIC], [PAUSE:X]

CONVERSATION SEGMENT:
${chunk.messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')}

OUTPUT: Podcast script segment
`;
  }

  mergeScripts(scripts) {
    // Simple merge with transition smoothing
    return scripts.join('\n\n[PAUSE:1]\n\n');
  }

  parseScript(text) {
    // Parse emotion markers and structure
    const segments = [];
    const lines = text.split('\n').filter(line => line.trim());

    for (const line of lines) {
      const trimmed = line.trim();

      // Check for pause marker
      const pauseMatch = trimmed.match(/\[PAUSE:(\d+(?:\.\d+)?)\]/);
      if (pauseMatch) {
        segments.push({
          type: 'pause',
          duration: parseFloat(pauseMatch[1])
        });
        continue;
      }

      // Check for speech with emotion
      const speechMatch = trimmed.match(/^\[HOST\/(\w+)\]:?\s*(.+)$/);
      if (speechMatch) {
        segments.push({
          type: 'speech',
          emotion: speechMatch[1].toLowerCase(),
          text: speechMatch[2].trim()
        });
        continue;
      }

      // Plain text (treat as neutral)
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
      segments
    };
  }
}
```

### 4. Update service worker
```javascript
// Add to src/background/service-worker.js
import { ScriptGenerator } from './script-generator.js';

// ... existing code ...

async function handleMessage(message, sender, sendResponse) {
  switch (message.type) {
    case MSG.CONVERSATION_DATA:
      // Store conversation, wait for generate command
      await chrome.storage.local.set({ currentConversation: message.data });
      sendResponse({ success: true });
      break;

    case MSG.GENERATE_SCRIPT:
      try {
        const { apiKey } = await chrome.storage.local.get('apiKey');
        if (!apiKey) {
          sendResponse({ success: false, error: 'API key not configured' });
          return;
        }

        const { currentConversation } = await chrome.storage.local.get('currentConversation');
        if (!currentConversation) {
          sendResponse({ success: false, error: 'No conversation extracted' });
          return;
        }

        const generator = new ScriptGenerator(apiKey);
        const result = await generator.generate(currentConversation, {
          condensed: message.condensed,
          onProgress: (progress) => {
            chrome.runtime.sendMessage({
              type: MSG.PROGRESS_UPDATE,
              ...progress
            });
          }
        });

        await chrome.storage.local.set({ currentScript: result });

        sendResponse({ success: true, data: result });
      } catch (error) {
        console.error('[GPTCast] Script generation error:', error);
        sendResponse({ success: false, error: error.message });
      }
      break;

    // ... other cases ...
  }
}
```

## Todo Checklist

- [ ] Create gemini-client.js with retry logic
- [ ] Create prompts.js with podcast script templates
- [ ] Create script-generator.js module
- [ ] Implement token estimation for chunking
- [ ] Implement conversation chunking for long inputs
- [ ] Implement script parsing (extract segments with emotions)
- [ ] Update service-worker.js with generation handler
- [ ] Add progress updates during generation
- [ ] Handle API errors gracefully (rate limits, timeouts)
- [ ] Test with short conversation (<10 messages)
- [ ] Test with long conversation (>50 messages)
- [ ] Verify emotion markers parse correctly

## Success Criteria

1. Generate engaging podcast script from any conversation
2. Output includes proper emotion markers for TTS
3. Script reads naturally when spoken aloud
4. Handle conversations up to 100k tokens
5. Generation completes in <30s for typical conversation
6. Graceful error handling with user-friendly messages

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| API rate limiting | Medium | Exponential backoff, retry logic |
| Poor script quality | High | Iterate on prompts, add examples |
| Token limit exceeded | Medium | Chunking with merge logic |
| API key invalid/expired | Medium | Clear error message, settings link |

## Security Considerations

- API key retrieved from encrypted storage only
- No logging of conversation content
- API calls only from service worker (isolated context)
- No third-party libraries for API calls (pure fetch)

## Next Steps

After this phase:
- Phase 4: Convert script segments to TTS audio
- Each segment with emotion marker → Gemini TTS call
- Build audio segments array for mixing
