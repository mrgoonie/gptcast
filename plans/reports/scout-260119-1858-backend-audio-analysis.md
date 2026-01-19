# Scout Report: Backend & Audio Processing Code Analysis
**Date:** 2026-01-19 | **Time:** 18:58 | **Focus:** Service Worker, Gemini Client, Script/TTS Generation, Audio Mixing

---

## 1. Module Overview

### Service Worker (`service-worker.js`) - 438 LOC
**Purpose:** Central orchestrator for Chrome Extension message routing and pipeline coordination.

**Key Responsibilities:**
- Message routing between popup, content script, and offscreen document
- Managing conversation/script/audio data lifecycle in Chrome storage
- Coordinating async tasks: script generation → TTS → audio mixing
- API key encryption/decryption management
- Offscreen document lifecycle (create/destroy)
- Audio download triggering

**Architecture Pattern:** Event-driven async message handler with state management (in-memory cache for large audio data).

---

### Gemini Client (`gemini-client.js`) - 223 LOC
**Purpose:** HTTP wrapper for Google Gemini API with resilience patterns.

**Key Responsibilities:**
- Text generation via `generateContent()` - script creation
- TTS audio generation via `generateTTS()` - speech synthesis
- Retry logic with exponential backoff (429 rate limiting)
- Timeout enforcement per operation type
- Response parsing and error handling
- API key injection in URL query parameters (Gemini official design)

**Resilience Features:**
- Configurable max retries (default 3)
- Exponential backoff: `2^attempt * retryDelay`
- Separate timeouts: 30s text, 90s TTS (from constants)
- 429 rate limit detection with smart backoff

---

### Script Generator (`script-generator.js`) - 207 LOC
**Purpose:** Transform ChatGPT conversations into podcast scripts with emotion markers.

**Key Responsibilities:**
- Parse conversation data into structured script segments
- Support chunked processing for long conversations (>token threshold)
- Inject emotion markers: `[HOST/EXCITED]`, `[HOST/CURIOUS]`, etc.
- Create pause markers: `[PAUSE:X]` (duration in seconds)
- Estimate token usage and auto-chunk when needed

**Output Format:**
```javascript
{
  script: {
    raw: "original text",
    segments: [
      { type: 'speech', emotion: 'neutral', text: '...' },
      { type: 'pause', duration: 1.5 }
    ],
    segmentCount: int,
    speechCount: int,
    pauseCount: int
  },
  metadata: { inputTokens, outputTokens, conversationTitle, condensed }
}
```

**Chunking Strategy:** Splits on message boundaries respecting token limits. Preserves context by adding position markers (OPENING/MIDDLE/CLOSING) for coherent multi-part scripts.

---

### TTS Generator (`tts-generator.js`) - 213 LOC
**Purpose:** Convert script segments to audio via Gemini TTS API with rate limiting and error recovery.

**Key Responsibilities:**
- Batch processing segments (concurrent requests, 500ms delay between batches)
- Generate silence for pause segments (duration: 0.1-10s, clamped)
- Split long text (>maxChars) into chunks at sentence boundaries
- Handle failed segments gracefully (error marker returned)
- Generate both regular and chunked audio formats

**Output Format:**
```javascript
{
  segments: [
    { type: 'audio', audioData: 'base64', mimeType: 'audio/wav', emotion, textLength },
    { type: 'audio_chunked', audioChunks: ['base64', ...], mimeType: 'audio/pcm', emotion, chunkCount },
    { type: 'silence', duration: 0.5 },
    { type: 'error', error: 'message', text: 'preview', emotion }
  ],
  metadata: { totalSegments, voice, generatedAt }
}
```

**Rate Limiting:** Concurrent batching (configurable, likely 3-5 requests) with 500ms inter-batch delay.

---

### Offscreen Document (`offscreen.js`) - 199 LOC
**Purpose:** Auto-processing audio mixer triggered on document load.

**Key Responsibilities:**
- Load `AudioMixer` module with error handling
- Read work parameters from IndexedDB (segments, musicUrl)
- Call mixer.mixAudio() with progress callback
- Convert output blob to base64
- Send result back to service worker
- Cleanup: close mixer, clear IndexedDB

**Message Pattern:** One-way result message to service worker (`mix_audio_result`). No state machine—purely functional pipeline triggered by page load.

**IndexedDB Schema:**
- DB: `gptcast-audio`, Store: `segments`
- Key: `'work'`, Value: `{ segments: [...], musicUrl: string }`

---

### Audio Mixer (`audio-mixer.js`) - 348 LOC
**Purpose:** Mix TTS segments with background music using Web Audio API (OfflineAudioContext for fast rendering).

**Key Responsibilities:**
- Load and decode audio segments + background music
- Schedule speech + music timing with audio ducking
- Render mixed audio using OfflineAudioContext (CPU speed, not real-time)
- Convert PCM/base64 audio to WAV format
- Inject dynamic gain ramping (duck music during speech)

**Architecture:** Two-phase rendering:
1. **Decode Phase:** Temporary online AudioContext for decoding base64 → AudioBuffer
2. **Mix Phase:** OfflineAudioContext for scheduling and rendering (FAST)

**Key Insight:** OfflineAudioContext renders at CPU speed, not real-time (1000x faster than playback speed typical). Example: 1-hour podcast renders in <10 seconds.

---

## 2. Key Functions & Classes

### Service Worker

| Function | Params | Returns | Notes |
|----------|--------|---------|-------|
| `getApiKey()` | - | `string \| null` | Handles AES-GCM decryption of encrypted keys; falls back to legacy plain text |
| `sendProgress(progress)` | `{ stage, progress, detail }` | void | Safely sends to popup (catches if closed) |
| `handleMessage(msg, sender, sendResponse)` | Message, Sender, Function | Promise | Router for 7 message types |
| `handleGenerateScript(msg, sendResponse)` | Message, Function | Promise | Validates API key + conversation, returns parsed script |
| `handleGenerateTTS(msg, sendResponse)` | Message, Function | Promise | Validates script exists, returns segment count (stores audio in memory) |
| `handleMixAudio(msg, sendResponse)` | Message, Function | Promise | Runs offscreen mixing pipeline |
| `runOffscreenMixing(segments, musicUrl)` | Array, URL | Promise | Creates offscreen doc, stores work data to IndexedDB, waits for result |
| `triggerDownload(audioData)` | `{ audio: base64, mimeType }` | Promise | Data URL download with sanitized filename |
| `getMusicUrl(mood)` | `'calm'\|'upbeat'\|'ambient'\|'none'` | URL \| null | Maps mood to bundled WAV file |

### Gemini Client

| Method | Params | Returns | Notes |
|--------|--------|---------|-------|
| `generateContent(prompt, options)` | `string, { temperature, topK, topP, maxTokens }` | `{ text, usageMetadata, finishReason }` | Retries on 429, throws on invalid key |
| `generateTTS(text, options)` | `string, { voice, emotion }` | `{ audioData: base64, mimeType }` | Uses `responseModalities: ['AUDIO']` |
| `testApiKey()` | - | `{ valid: bool, error?: string }` | Simple 3-word generation test |
| `buildTTSPrompt(text, emotion)` | `string, emotion` | `string` | Maps emotion to instruction string |
| `parseTextResponse(data)` | API response | `{ text, usageMetadata, finishReason }` | Extracts text from nested structure |
| `parseTTSResponse(data)` | API response | `{ audioData, mimeType, usageMetadata }` | Finds audio part by mime type |
| `fetchWithTimeout(url, options, timeout)` | URL, options, ms | Promise<Response> | AbortController-based timeout |
| `delay(ms)` | ms | Promise | Resolve after delay |

### Script Generator

| Method | Params | Returns | Notes |
|--------|--------|---------|-------|
| `generate(conversation, options)` | Convo object, `{ condensed, onProgress }` | `{ script, metadata }` | Entry point; auto-chunks if needed |
| `generateChunked(conversation, options)` | Convo object, options | `{ script, metadata }` | Process chunks separately, merge with pauses |
| `chunkConversation(conversation, maxTokens)` | Convo, int | Array<Convo> | Splits on message boundaries |
| `buildChunkPrompt(chunk, index, total)` | Chunk, int, int | string | LLM prompt with position markers (OPENING/MIDDLE/CLOSING) |
| `parseScript(text)` | string | `{ raw, segments, counts }` | Regex-based: emotion markers + pauses → segment objects |
| `mergeScripts(scripts)` | Array<string> | string | Joins with `[PAUSE:1]` separator |

### TTS Generator

| Method | Params | Returns | Notes |
|--------|--------|---------|-------|
| `generateAudio(script, options)` | Script object, `{ voice, onProgress }` | `{ segments, metadata }` | Batch processes in concurrent groups with 500ms delay |
| `generateSegmentAudio(segment, voice)` | Segment, string | Promise<AudioSegment> | Single segment; auto-chunks if text too long |
| `generateChunkedAudio(text, emotion, voice)` | string, string, string | Promise<ChunkedSegment> | Splits at sentence boundaries, generates each chunk |
| `chunkText(text)` | string | Array<string> | Regex: sentence splitting with word fallback |
| `createSilenceSegment(duration)` | number | `{ type: 'silence', duration }` | Clamps 0.1-10s |
| `delay(ms)` | ms | Promise | Rate limit delay |

### Audio Mixer

| Method | Params | Returns | Notes |
|--------|--------|---------|-------|
| `mixAudio(segments, musicUrl, onProgress)` | Array, URL, callback | Promise<Blob> | Main entry point; uses OfflineAudioContext |
| `loadMusic(context, url)` | AudioContext, URL | Promise<AudioBuffer> | Fetch + decode; returns null on failure |
| `loadSpeechSegments(context, segments, onProgress)` | AudioContext, Array, callback | Promise<Array<Buffer>> | Decode audio/silence segments |
| `decodeSegment(context, base64)` | AudioContext, string | Promise<AudioBuffer> | Converts base64 → PCM → WAV → decode |
| `decodeChunkedSegment(context, chunks)` | AudioContext, Array<base64> | Promise<AudioBuffer> | Merges base64 chunks then decodes |
| `decodeFromPCM(context, arrayBuffer)` | AudioContext, buffer | Promise<AudioBuffer> | PCM → WAV wrapper → decode (fallback to 0.5s silence on error) |
| `scheduleMusic(context, musicGain, musicBuffer, totalDuration)` | Context, Gain, Buffer, number | void | Loop music, stop at duration |
| `scheduleSpeech(context, speechGain, musicGain, buffers, hasMusic)` | Context, Gain, Gain, Array, bool | void | Schedule speech + ducking logic |
| `audioBufferToWav(audioBuffer)` | AudioBuffer | Blob | PCM 16-bit WAV encoder |
| `pcmToWav(pcmData)` | ArrayBuffer | ArrayBuffer | Prepends 44-byte WAV header |
| `createWavHeader(dataLen, sampleRate, channels, bitsPerSample)` | int, int, int, int | ArrayBuffer | 44-byte WAV RIFF header |
| `base64ToArrayBuffer(base64)` | string | ArrayBuffer | Handles URL-safe base64 + padding |
| `hasAudioContent(buffer)` | AudioBuffer | bool | Samples every 1000th value, threshold > 0.001 |
| `copyBufferToContext(context, sourceBuffer)` | Context, Buffer | Buffer | Required because buffers are context-specific |
| `mergeAudioChunks(chunks)` | Array<base64> | ArrayBuffer | Concatenates base64 chunks |

---

## 3. Data Flow

### Pipeline: End-to-End Podcast Generation

```
Popup (User initiates)
    ↓
Service Worker (Message router)
    ├─→ [CONVERSATION_DATA] → store to chrome.storage.local
    ├─→ [GENERATE_SCRIPT] → ScriptGenerator.generate() 
    │     ├─ GeminiClient.generateContent(prompt)
    │     └─ Return: Script with emotion markers + pauses
    │     → Store to chrome.storage.local
    │
    ├─→ [GENERATE_TTS] → TTSGenerator.generateAudio()
    │     ├─ For each script segment:
    │     │   ├─ If pause: createSilenceSegment()
    │     │   └─ If speech: GeminiClient.generateTTS(text, emotion)
    │     ├─ Batch processing (concurrent, 500ms delay)
    │     └─ Return: Segments with base64 audio
    │     → Store in memory (currentAudioResult)
    │
    ├─→ [MIX_AUDIO] → runOffscreenMixing()
    │     ├─ Store to IndexedDB: { segments, musicUrl }
    │     ├─ Create offscreen document
    │     └─ Wait for result via mixResultResolve promise
    │
    └─→ Offscreen Document (auto-process on load)
          ├─ Read IndexedDB
          ├─ AudioMixer.mixAudio()
          │   ├─ Load music + decode segments (online context)
          │   ├─ OfflineAudioContext for mixing (fast rendering)
          │   ├─ Schedule speech + music timing
          │   ├─ Apply audio ducking (music volume down during speech)
          │   └─ Convert to WAV blob
          ├─ base64 encode blob
          └─ Send message: 'mix_audio_result' → Service Worker
                ├─ triggerDownload(audioData)
                └─ chrome.downloads.download() with data URL
```

### Message Types Handled

| Type | From | To | Payload | Response |
|------|------|----|---------| ---------|
| `CONVERSATION_DATA` | Popup | SW | `{ data: ConversationObject }` | `{ success }` |
| `GENERATE_SCRIPT` | Popup | SW | `{ condensed?: bool }` | `{ success, data: ScriptResult }` |
| `GENERATE_TTS` | Popup | SW | `{ voice: string }` | `{ success, data: { segmentCount } }` |
| `MIX_AUDIO` | Popup | SW | `{ musicMood: 'calm'\|'upbeat'\|'ambient' }` | `{ success, data: AudioData }` |
| `GENERATE_PODCAST` | Popup | SW | `{ musicMood }` | `{ success }` (triggers download) |
| `DOWNLOAD_AUDIO` | Popup | SW | `{ data: AudioData }` | `{ success }` |
| `TEST_API_KEY` | Settings | SW | - | `{ success, error? }` |
| `mix_audio_result` | Offscreen | SW | `{ success, data?, error? }` | - |
| `PROGRESS_UPDATE` | Any | Popup | `{ stage, progress, detail }` | - |

---

## 4. External Dependencies

### Google Gemini API
- **Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models`
- **Models:** `gemini-2.0-flash-exp` (text), `gemini-2.0-flash-exp` (TTS)
- **Text Generation:** POST with `generationConfig` (temperature, topK, topP, maxTokens)
- **TTS:** POST with `responseModalities: ['AUDIO']` + `speechConfig`
- **Auth:** Query parameter `key=` (official Gemini API design)
- **Rate Limits:** 429 responses handled with exponential backoff

### Chrome APIs
- `chrome.runtime.onMessage` - Message passing
- `chrome.runtime.sendMessage` - Send messages
- `chrome.runtime.getContexts` - Detect existing offscreen docs
- `chrome.offscreen.createDocument` / `closeDocument` - Lifecycle
- `chrome.storage.local.get/set` - Persistent storage (10MB quota)
- `chrome.downloads.download` - Trigger downloads (data URL)

### Web Audio API (Offscreen Context)
- `AudioContext` - Online decoding
- `OfflineAudioContext` - Fast non-real-time mixing
- `AudioBuffer`, `BufferSource`, `Gain` nodes
- `decodeAudioData()` - PCM/WAV decoding
- Linear gain ramping for audio ducking

### IndexedDB
- Database: `gptcast-audio`
- Store: `segments`
- Used for inter-process work data (segments + musicUrl)

### File/Format APIs
- `FileReader` - Blob to base64 conversion
- WAV header generation (RIFF/PCM format)
- Base64 encoding/decoding (URL-safe variants)

---

## 5. Configuration Points

### Constants (from imports)

**From `constants.js`:**
- `API.GEMINI_MODEL` - Text model name
- `API.GEMINI_TTS_MODEL` - TTS model name
- `API.GEMINI_BASE` - API base URL
- `API.MAX_RETRIES` - Retry attempts (default 3)
- `API.RETRY_DELAY_MS` - Base retry delay (default 1000ms)
- `API.TIMEOUT_TEXT_MS` - Text generation timeout (30000ms)
- `API.TIMEOUT_TTS_MS` - TTS timeout (90000ms)
- `API.MAX_TOKENS_PER_CHUNK` - Script chunking threshold
- `API.MAX_TOKENS_BEFORE_CHUNKING` - Conversation chunking trigger
- `TTS.MAX_CHARS_PER_REQUEST` - Text chunking limit per TTS call
- `TTS.CONCURRENT_REQUESTS` - Batch size for TTS parallelization
- `TTS.SAMPLE_RATE` - Audio sample rate (24000Hz typical)
- `AUDIO.MUSIC_VOLUME` - Music base volume (0.0-1.0)
- `AUDIO.MUSIC_DUCK_VOLUME` - Music volume during speech (ducked)
- `AUDIO.DUCK_RAMP_TIME` - Gain ramp duration for ducking

**From `voice-config.js`:**
- `DEFAULT_VOICE` - Default Gemini voice (e.g., 'Puck')

**From `storage-keys.js`:**
- `STORAGE_KEYS.API_KEY` - Chrome storage key for API key
- `STORAGE_KEYS.ENCRYPTION_KEY` - AES-GCM key for encryption
- `STORAGE_KEYS.CURRENT_CONVERSATION` - Conversation data
- `STORAGE_KEYS.CURRENT_SCRIPT` - Script result
- `STORAGE_KEYS.CURRENT_SCRIPT` - TTS result reference

**Hardcoded in Service Worker:**
- Music mood mapping: `{ calm, upbeat, ambient, none }`
- Offscreen document reasons: `['AUDIO_PLAYBACK']`
- Offscreen document path: `'src/offscreen/offscreen.html'`
- Mix timeout: 300000ms (5 minutes)

---

## 6. Error Handling Patterns

### Retry Strategy (Gemini Client)

```javascript
for (let attempt = 0; attempt < maxRetries; attempt++) {
  try {
    // Attempt operation
  } catch (error) {
    if (response.status === 429) {
      // Rate limited: exponential backoff
      await delay(2^attempt * retryDelay)
      continue
    }
    if (error.message.includes('Invalid API key')) {
      throw // Don't retry invalid key
    }
    await delay(2^attempt * retryDelay)
  }
}
throw lastError
```

### Segment Failure Tolerance

**TTS Generation:**
- Individual segment failure → return `{ type: 'error', error: 'message' }`
- Pipeline continues (partial success)
- Service Worker checks: if all segments failed → return error to user
- If mixed (success + failures) → warn but proceed with successful segments

**Audio Mixing:**
- Failed segments → replace with 0.5s silence
- Continues rendering with remaining audio
- Silent fallback for decode failures

### Message Safety

```javascript
// Popup may be closed - catch and ignore
chrome.runtime.sendMessage({...}).catch(() => {})

// Progress callback may fail - continue processing
try { onProgress?.(...) } catch { }
```

### Offscreen Lifecycle

- Closes existing offscreen before creating new one
- 5-minute timeout on mix result promise
- Cleanup even on failure: `mixer.cleanup()`, `clearWorkData()`

---

## 7. Code Quality Patterns & Notable Implementations

### Patterns Used

1. **Message Router Pattern** (Service Worker)
   - Switch-based handler dispatch
   - Async message returns `true` for chrome to wait for `sendResponse`
   - Separates concerns: validation → delegation → storage

2. **Exponential Backoff**
   - Respects 429 rate limits without aggressive retry
   - Formula: `2^attempt * baseDelay` (1s → 2s → 4s)

3. **Progress Callback Pattern**
   - Async operations accept `onProgress(data)` callback
   - Called at key milestones (10% → 90% → 100%)
   - Callbacks are fire-and-forget (failures ignored)

4. **Dual Context Audio Processing**
   - Online AudioContext for decoding (can fetch/decode in real-time)
   - OfflineAudioContext for fast rendering (CPU speed, not playback speed)
   - Buffer copying required (context-specific buffers)

5. **Audio Ducking via Gain Ramping**
   - During speech: `musicGain.linearRampToValueAtTime(duckVolume, t1)`
   - After speech: `musicGain.linearRampToValueAtTime(normalVolume, t2)`
   - Smooth volume transitions (default 100ms ramp time)

6. **Chunking at Boundaries**
   - Script: message-level splits (preserves context)
   - Text: sentence-level splits (preserves meaning)
   - Fallback: word-level splits (hard truncate as last resort)

### Notable Implementations

1. **OfflineAudioContext Rendering** (Audio Mixer)
   - Renders entire podcast in seconds (not real-time playback duration)
   - All timing pre-calculated before rendering
   - No playback during mix process

2. **Base64 URL-Safe Handling**
   - Accepts standard + URL-safe variants (`-`/`_` → `+`/`/`)
   - Auto-adds padding (`%4 == 0` validation)

3. **WAV Header Generation**
   - 44-byte RIFF header for PCM audio
   - Custom implementation (no external WAV library)
   - Supports dynamic sample rates + bit depths

4. **Encrypted API Key Storage**
   - AES-GCM encryption with random IV
   - Falls back to legacy plain-text for backward compatibility
   - Decryption only on demand

5. **IndexedDB for Cross-Process Communication**
   - Service Worker stores work data (segments + musicUrl)
   - Offscreen document reads immediately on load
   - Auto-cleanup after processing (no stale data)

### Anti-Patterns / Considerations

1. **In-Memory Audio Cache** (currentAudioResult)
   - Not persisted; lost on service worker termination
   - Required because chrome.storage.local has 10MB quota
   - Audio blobs can exceed this (mitigated by streaming download)

2. **Promise Resolver Global** (mixResultResolve)
   - Single promise handler for offscreen result
   - If multiple mixes triggered simultaneously → overwrites previous promise
   - Current implementation assumes sequential mixes

3. **Silent Fallback on Decode Error**
   - Failed audio segments become 0.5s silence
   - User may not notice missing content
   - Consider logging + user notification

4. **No Timeout on Individual TTS Calls**
   - Only timeout on HTTP fetch (90s)
   - Long text chunks may still take >90s
   - Consider per-chunk timeout

---

## 8. Critical Insights for Documentation

### Architecture Strengths
- Clear separation: Service Worker (orchestration) → Clients (API) → Generators (logic) → Mixer (rendering)
- Offline rendering avoids real-time constraints (solves previous mixer issues)
- Graceful degradation: partial failures don't block pipeline

### Performance Characteristics
- Script generation: ~5-10s per conversation (depends on LLM)
- TTS generation: ~2-3s per segment (bottleneck)
- Audio mixing: ~1-5s per hour of podcast (OfflineAudioContext advantage)
- Download: instant (data URL, no server upload)

### Security Notes
- API key encrypted in storage (AES-GCM)
- No sensitive data in IndexedDB (only work parameters)
- Base64-encoded audio passed via messages (no external upload)

### Future Improvement Points
- Implement concurrent mix result handling (multiple promises)
- Add per-chunk TTS timeout
- Consider WAV streamer for large files (current: blob → base64 → blob)
- Cache decoded audio buffers to avoid re-decoding
- Add telemetry for error rates (which segments fail most?)

---

## Unresolved Questions
- What happens if service worker terminates during TTS generation? (In-memory audio cache lost)
- Simultaneous podcast generation requests → overwrites promise resolver?
- Maximum audio file size before base64 → message payload exceeds limits?
