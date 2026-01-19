# Phase 4: TTS Audio Generation

## Context Links
- [Gemini API Integration](./research/researcher-02-gemini-api-integration.md)
- [TTS Research](../reports/researcher-260118-2247-chatgpt-to-podcast-tts-audio-research.md)
- [Phase 3 - Script Generation](./phase-03-script-generation.md)

## Overview
- **Priority**: P0 (Core feature)
- **Status**: completed (2026-01-19T00:06:00Z)
- **Effort**: 3h
- **Description**: Convert podcast script segments to expressive audio using Gemini TTS with emotional prompting
- **Review**: [Code Review Report](./reports/phase-04-code-review.md)

## Key Insights

### Gemini TTS Capabilities
- **Natural language prompting**: "Say with excitement and energy", "sound tired and bored"
- **30 prebuilt voices**: Kore (firm), Puck (upbeat), Enceladus (breathy), etc.
- **Audio format**: PCM base64-encoded (24kHz, 16-bit, mono)
- **Max input**: 4,000 bytes (~4000 chars) per request
- **Max output**: ~655 seconds per request

### Emotional Prompting Strategy
Map script emotions to TTS prompts:
```javascript
{
  'excited': 'Say with high energy and enthusiasm',
  'curious': 'Say with questioning intonation and wonder',
  'thoughtful': 'Say slowly and reflectively',
  'emphatic': 'Say with strong conviction and emphasis',
  'warm': 'Say in a friendly, conversational tone',
  'neutral': 'Say in a clear, natural voice'
}
```

### Audio Pipeline
Script → Segments → TTS calls (parallel where possible) → Audio blobs → Offscreen for mixing

## Requirements

### Functional
- Convert script segments to audio with emotional expression
- Handle pause markers (generate silence)
- Support voice selection (multiple options)
- Chunk long segments to fit API limits
- Collect all audio blobs for mixing phase

### Non-Functional
- TTS generation in <60s for typical script (15-20 segments)
- Parallel API calls where possible (rate limit aware)
- Graceful handling of TTS failures per segment
- Progress updates to UI

## Architecture

```
Script (from Phase 3)
├── Segment 1: {emotion: 'excited', text: '...'}
├── Segment 2: {type: 'pause', duration: 1.5}
├── Segment 3: {emotion: 'curious', text: '...'}
└── ...
        │
        ▼
┌──────────────────────────┐
│  TTS Generator           │
│  (service-worker.js)     │
├──────────────────────────┤
│  - buildTTSPrompt()      │
│  - chunkSegment()        │
│  - callGeminiTTS()       │
│  - generateSilence()     │
│  - collectAudioBlobs()   │
└──────────────────────────┘
        │
        ▼
   Gemini TTS API
        │
        ▼
  Audio Blobs Array
  (ArrayBuffer per segment)
```

## Related Code Files

### Create
- `src/background/tts-generator.js` - TTS API integration
- `src/shared/voice-config.js` - Voice options and emotion mappings

### Modify
- `src/background/service-worker.js` - Add TTS handler
- `src/background/gemini-client.js` - Add TTS method

## Implementation Steps

### 1. Create voice configuration
```javascript
// src/shared/voice-config.js
export const VOICES = {
  // Recommended for podcast narration
  kore: { name: 'Kore', style: 'Firm, authoritative' },
  puck: { name: 'Puck', style: 'Upbeat, energetic' },
  charon: { name: 'Charon', style: 'Warm, friendly' },
  fenrir: { name: 'Fenrir', style: 'Deep, contemplative' },
  aoede: { name: 'Aoede', style: 'Bright, cheerful' }
};

export const DEFAULT_VOICE = 'puck';

export const EMOTION_PROMPTS = {
  excited: 'Say with high energy, enthusiasm, and genuine excitement',
  curious: 'Say with questioning intonation, wonder, and intrigue',
  thoughtful: 'Say slowly and reflectively, with pauses for emphasis',
  emphatic: 'Say with strong conviction, emphasis, and authority',
  warm: 'Say in a friendly, conversational, welcoming tone',
  neutral: 'Say clearly and naturally, like a professional narrator'
};

export function buildTTSPrompt(text, emotion) {
  const emotionPrompt = EMOTION_PROMPTS[emotion] || EMOTION_PROMPTS.neutral;
  return `${emotionPrompt}: "${text}"`;
}
```

### 2. Add TTS method to Gemini client
```javascript
// Add to src/background/gemini-client.js
export class GeminiClient {
  // ... existing code ...

  async generateTTS(text, options = {}) {
    const { voice = 'Puck', emotion = 'neutral' } = options;

    // Build emotional prompt
    const prompt = this.buildTTSPrompt(text, emotion);

    const endpoint = `${API_BASE}/${this.model}:generateContent?key=${this.apiKey}`;

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
        }, 60000); // Longer timeout for audio

        if (!response.ok) {
          const error = await response.json();
          if (response.status === 429) {
            await this.delay(Math.pow(2, attempt) * this.retryDelay);
            continue;
          }
          throw new Error(error.error?.message || `TTS error: ${response.status}`);
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

  parseTTSResponse(data) {
    const candidate = data.candidates?.[0];
    if (!candidate) {
      throw new Error('No TTS response generated');
    }

    const audioPart = candidate.content?.parts?.find(p => p.inlineData?.mimeType?.startsWith('audio/'));
    if (!audioPart) {
      throw new Error('No audio in response');
    }

    // Base64 encoded PCM audio
    return {
      audioData: audioPart.inlineData.data,
      mimeType: audioPart.inlineData.mimeType,
      usageMetadata: data.usageMetadata
    };
  }
}
```

### 3. Create TTS generator module
```javascript
// src/background/tts-generator.js
import { GeminiClient } from './gemini-client.js';
import { VOICES, DEFAULT_VOICE } from '../shared/voice-config.js';

export class TTSGenerator {
  constructor(apiKey) {
    this.client = new GeminiClient(apiKey);
    this.maxCharsPerRequest = 3500; // Leave buffer under 4000 limit
    this.concurrentRequests = 3; // Parallel calls limit
  }

  async generateAudio(script, options = {}) {
    const { voice = DEFAULT_VOICE, onProgress } = options;
    const audioSegments = [];

    const segments = script.segments;
    const totalSegments = segments.length;

    // Process in batches for rate limiting
    for (let i = 0; i < segments.length; i += this.concurrentRequests) {
      const batch = segments.slice(i, i + this.concurrentRequests);

      const batchPromises = batch.map(async (segment, batchIndex) => {
        const segmentIndex = i + batchIndex;

        onProgress?.({
          stage: 'tts',
          progress: Math.round((segmentIndex / totalSegments) * 100),
          detail: `Generating audio ${segmentIndex + 1}/${totalSegments}`
        });

        if (segment.type === 'pause') {
          return this.generateSilence(segment.duration);
        }

        return this.generateSegmentAudio(segment, voice);
      });

      const batchResults = await Promise.all(batchPromises);
      audioSegments.push(...batchResults);

      // Small delay between batches for rate limiting
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

  async generateSegmentAudio(segment, voice) {
    const { emotion, text } = segment;

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
        text
      };
    } catch (error) {
      console.error(`[GPTCast] TTS error for segment:`, error);

      // Return placeholder for failed segment
      return {
        type: 'error',
        error: error.message,
        text,
        emotion
      };
    }
  }

  async generateChunkedAudio(text, emotion, voice) {
    const chunks = this.chunkText(text);
    const audioChunks = [];

    for (const chunk of chunks) {
      const result = await this.client.generateTTS(chunk, { voice, emotion });
      audioChunks.push(result.audioData);

      // Small delay between chunks
      await this.delay(300);
    }

    // Return combined chunks (will be merged in offscreen)
    return {
      type: 'audio_chunked',
      audioChunks,
      mimeType: 'audio/pcm',
      emotion,
      text
    };
  }

  chunkText(text) {
    const chunks = [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > this.maxCharsPerRequest) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = sentence;
      } else {
        currentChunk += sentence;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  generateSilence(durationSeconds) {
    // Generate silence marker (actual silence created in offscreen)
    return {
      type: 'silence',
      duration: durationSeconds
    };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 4. Update service worker with TTS handler
```javascript
// Add to src/background/service-worker.js
import { TTSGenerator } from './tts-generator.js';

// ... existing code ...

async function handleMessage(message, sender, sendResponse) {
  switch (message.type) {
    // ... existing cases ...

    case MSG.GENERATE_TTS:
      try {
        const { apiKey } = await chrome.storage.local.get('apiKey');
        if (!apiKey) {
          sendResponse({ success: false, error: 'API key not configured' });
          return;
        }

        const { currentScript } = await chrome.storage.local.get('currentScript');
        if (!currentScript) {
          sendResponse({ success: false, error: 'No script generated' });
          return;
        }

        const generator = new TTSGenerator(apiKey);
        const result = await generator.generateAudio(currentScript.script, {
          voice: message.voice || 'Puck',
          onProgress: (progress) => {
            chrome.runtime.sendMessage({
              type: MSG.PROGRESS_UPDATE,
              ...progress
            });
          }
        });

        // Store audio segments for mixing
        await chrome.storage.local.set({ currentAudio: result });

        sendResponse({ success: true, data: result });
      } catch (error) {
        console.error('[GPTCast] TTS generation error:', error);
        sendResponse({ success: false, error: error.message });
      }
      break;
  }
}
```

### 5. Add audio utilities
```javascript
// src/shared/audio-utils.js
export function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export function createPCMHeader(dataLength, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  // "RIFF" chunk descriptor
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + dataLength, true); // File size - 8
  view.setUint32(8, 0x57415645, false); // "WAVE"

  // "fmt " sub-chunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * (bitsPerSample / 8), true); // ByteRate
  view.setUint16(32, channels * (bitsPerSample / 8), true); // BlockAlign
  view.setUint16(34, bitsPerSample, true);

  // "data" sub-chunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, dataLength, true);

  return header;
}

export function pcmToWav(pcmData, sampleRate = 24000) {
  const header = createPCMHeader(pcmData.byteLength, sampleRate);
  const wavBuffer = new Uint8Array(header.byteLength + pcmData.byteLength);
  wavBuffer.set(new Uint8Array(header), 0);
  wavBuffer.set(new Uint8Array(pcmData), header.byteLength);
  return wavBuffer.buffer;
}

export function generateSilenceBuffer(durationSeconds, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const numSamples = Math.floor(durationSeconds * sampleRate);
  const bytesPerSample = bitsPerSample / 8;
  const bufferSize = numSamples * channels * bytesPerSample;

  // Return zero-filled buffer (silence)
  return new ArrayBuffer(bufferSize);
}
```

## Todo Checklist

- [ ] Create voice-config.js with voice options and emotion mappings
- [ ] Add generateTTS() method to gemini-client.js
- [ ] Create tts-generator.js module
- [ ] Implement text chunking for long segments
- [ ] Implement batch processing with rate limiting
- [ ] Create audio-utils.js for PCM/WAV handling
- [ ] Update service-worker.js with TTS handler
- [ ] Handle silence/pause segments
- [ ] Handle TTS failures gracefully (per segment)
- [ ] Test with various emotions
- [ ] Test with different voices
- [ ] Test long text chunking

## Success Criteria

1. All script segments converted to audio
2. Emotional expression audible in output
3. Pause markers create appropriate silence
4. Generation completes in <60s for typical script
5. Failed segments don't break entire generation
6. Progress updates visible in UI

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| TTS rate limiting | High | Batch processing, delays between calls |
| Audio format incompatibility | Medium | PCM→WAV conversion utilities |
| Long segment timeout | Medium | Chunking with sentence boundaries |
| Variable audio quality | Low | Consistent voice and emotion settings |

## Security Considerations

- API key used only in service worker context
- Audio data stored temporarily in extension storage
- No external transmission of audio content
- Base64 audio decoded in isolated context

## Next Steps

After this phase:
- Phase 5: Mix TTS audio with background music
- Offscreen document handles Web Audio API mixing
- Auto-ducking music during speech
- Export as downloadable MP3
