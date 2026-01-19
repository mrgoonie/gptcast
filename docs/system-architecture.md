# System Architecture

## High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Chrome Extension (MV3)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐         ┌────────────────┐                     │
│  │    Popup UI  │◄────────│  Message Types │                     │
│  │  (popup.js)  │         │  (msg-types.js)│                     │
│  └──────┬───────┘         └────────────────┘                     │
│         │                                                          │
│         │ chrome.runtime.sendMessage()                            │
│         │                                                          │
│  ┌──────▼──────────────────────────────────────┐                 │
│  │     Service Worker (Background)             │                 │
│  │  ┌──────────────────────────────────────┐   │                 │
│  │  │ Message Router (7 message types)     │   │                 │
│  │  └──────┬──────────────────────────────┘   │                 │
│  │         │                                   │                 │
│  │  ┌──────┴──────┬──────────┬────────────┐   │                 │
│  │  │             │          │            │   │                 │
│  │  ▼             ▼          ▼            ▼   │                 │
│  │ Script      TTS Gen    Mix Audio   API Key  │                 │
│  │ Generator   rator      Orchestr.   Manager  │                 │
│  │ (gen.js)    (gen.js)   (mixer.js) (utils)  │                 │
│  │                                             │                 │
│  │ ┌─────────────────────────────────────┐    │                 │
│  │ │  Gemini API Client (gemini.js)      │    │                 │
│  │ └──────────┬──────────────────────────┘    │                 │
│  │            │                                │                 │
│  └────────────┼────────────────────────────────┘                 │
│               │ HTTP/HTTPS                                        │
│               ▼                                                    │
│      ┌────────────────────┐                                       │
│      │  Google Gemini API │                                       │
│      │  • Text Gen (Flash)│                                       │
│      │  • TTS (2.5 Flash) │                                       │
│      └────────────────────┘                                       │
│                                                                   │
│  ┌──────────────────────────────────────────┐                    │
│  │  Offscreen Document (Web Audio Context)  │                    │
│  │  ┌──────────────────────────────────────┐│                    │
│  │  │  Audio Mixer (audio-mixer.js)        ││                    │
│  │  │  • Load audio segments               ││                    │
│  │  │  • Decode PCM/base64                 ││                    │
│  │  │  • Mix with background music         ││                    │
│  │  │  • Apply audio ducking               ││                    │
│  │  │  • Render via OfflineAudioContext    ││                    │
│  │  │  • Convert to WAV                    ││                    │
│  │  └──────────────────────────────────────┘│                    │
│  └──────────────────────────────────────────┘                    │
│         │                                                          │
│         │ IndexedDB (large audio data)                            │
│         ▼                                                          │
│   ┌──────────────┐                                                │
│   │   gptcast    │                                                │
│   │  -audio DB   │                                                │
│   └──────────────┘                                                │
│                                                                   │
│  ┌─────────────────────────────────────────┐                     │
│  │  Content Script (content-script.js)     │                     │
│  │  • DOM extraction from ChatGPT          │                     │
│  │  • Message: EXTRACT_CONVERSATION        │                     │
│  └─────────────────────────────────────────┘                     │
│         │                                                          │
│         │ Injected on https://chatgpt.com                         │
│         ▼                                                          │
│   ┌──────────────┐                                                │
│   │  ChatGPT    │                                                 │
│   │  Page DOM   │                                                 │
│   └──────────────┘                                                │
│                                                                   │
│  ┌────────────────────────────────────────────┐                  │
│  │  Storage (Chrome API)                      │                  │
│  │  • Conversation data (currentConversation) │                  │
│  │  • Script result (currentScript)           │                  │
│  │  • Audio cache (in-memory)                 │                  │
│  │  • Encrypted API key (apiKey)              │                  │
│  └────────────────────────────────────────────┘                  │
│                                                                   │
│  ┌────────────────────────────────────────────┐                  │
│  │  Chrome Downloads API                      │                  │
│  │  • Trigger download (data URL)             │                  │
│  │  • Auto-generated filename                 │                  │
│  └────────────────────────────────────────────┘                  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

### Popup UI (popup.html, popup.css, popup.js)
**Responsibility**: User interaction & state management

- 6-view state machine: initial → preview → processing → complete/error/settings
- Display conversation metadata (title, message count)
- Collect user preferences (voice, music, condensed mode)
- Show progress during generation (progress bar, stage text)
- Error display + retry options
- API key settings (encrypted input, test button)

**Key Functions**:
- `checkApiKey()` - Validate stored key; enable/disable extract button
- `sendMessageWithTimeout()` - IPC with 5s default timeout
- `handleExtract()` - Send EXTRACT_CONVERSATION to content script
- `handleGenerate()` - Orchestrate 3-phase pipeline
- `updateProgress()` - Listen for PROGRESS_UPDATE from service worker

### Service Worker (service-worker.js)
**Responsibility**: Orchestration hub & message router

- Route 7 message types from popup/content-script
- Coordinate async pipeline: script → TTS → mixing
- Manage conversation/script/audio storage (10MB chrome.storage quota)
- Create/close offscreen documents for audio mixing
- Trigger downloads
- Send progress updates back to popup
- Manage API key encryption/decryption

**Key Functions**:
- `handleMessage()` - Switch-based dispatcher
- `handleGenerateScript()` - Validate + delegate to script-generator
- `handleGenerateTTS()` - Validate + delegate to tts-generator, cache result
- `handleMixAudio()` - Orchestrate offscreen mixing via IndexedDB
- `runOffscreenMixing()` - Create offscreen, store data, wait for result
- `sendProgress()` - Send to popup (catch if closed)
- `triggerDownload()` - Chrome downloads.download API

### Gemini Client (gemini-client.js)
**Responsibility**: HTTP API wrapper with resilience

- Exponential backoff retry on 429 rate limits
- Timeout enforcement (30s text, 90s TTS)
- Response parsing (text vs. audio)
- Error handling + logging

**Key Methods**:
- `generateContent(prompt, options)` - Text generation
- `generateTTS(text, options)` - Audio synthesis
- `testApiKey()` - Validation endpoint
- `fetchWithTimeout()` - Abort-controller timeout
- `delay()` - Backoff delay

### Script Generator (script-generator.js)
**Responsibility**: Conversation → podcast script

- Parse conversation into segments
- Inject emotion markers: `[HOST/EXCITED]`, `[PAUSE:1]`, etc.
- Token-aware chunking for long conversations
- Support condensed mode (shorter output)
- Fallback to chunking when exceeding token limits

**Key Methods**:
- `generate()` - Main entry point
- `generateChunked()` - Process chunks separately
- `parseScript()` - Regex-based segment extraction
- `mergeScripts()` - Combine chunks with pause separators
- `chunkConversation()` - Split at message boundaries

### TTS Generator (tts-generator.js)
**Responsibility**: Script segments → audio via Gemini TTS

- Batch process segments (concurrent requests, 500ms inter-batch delay)
- Generate silence for pause markers
- Chunk long text at sentence boundaries
- Graceful failure (partial success OK)
- Return base64-encoded audio + metadata

**Key Methods**:
- `generateAudio()` - Orchestrate batch processing
- `generateSegmentAudio()` - Single segment
- `generateChunkedAudio()` - Split + generate chunks
- `chunkText()` - Sentence/word-level splits
- `createSilenceSegment()` - Duration clamped 0.1-10s

### Content Script (content-script.js)
**Responsibility**: ChatGPT DOM extraction

- Listen for EXTRACT_CONVERSATION message
- Query ChatGPT DOM (primary: `[data-message-author-role]`)
- Extract user + assistant messages
- Clean text (normalize whitespace, remove copy artifacts)
- Fallback selectors on DOM changes
- Return conversation object with metadata

**Key Functions**:
- `extractConversation()` - Main orchestrator
- `getMessageRole()` - Determine user/assistant
- `extractContent()` - Get text from role-specific selectors
- `cleanContent()` - Normalize text
- `extractWithFallback()` - Alternative selectors

### Audio Mixer (audio-mixer.js)
**Responsibility**: Web Audio API mixing + WAV encoding

- **Decode Phase** (online AudioContext):
  - Load music from bundled WAV files
  - Decode base64 → PCM → WAV → AudioBuffer
  - Supports multiple audio formats

- **Mix Phase** (OfflineAudioContext):
  - Schedule music (loop until end time)
  - Schedule speech segments with timing
  - Apply audio ducking: music volume down during speech
  - Render entire podcast at CPU speed (not real-time)

- **Output Phase**:
  - Convert to WAV format (16-bit PCM)
  - Return blob for download

**Key Methods**:
- `mixAudio()` - Main entry point
- `loadMusic()` - Fetch + decode background track
- `loadSpeechSegments()` - Batch decode segments
- `scheduleMusic()` - Loop music until duration
- `scheduleSpeech()` - Place segments + ducking
- `audioBufferToWav()` - PCM 16-bit WAV encoder
- `decodeSegment()` - Base64 → AudioBuffer
- `hasAudioContent()` - Check if buffer has signal

### Offscreen Document (offscreen.html, offscreen.js)
**Responsibility**: Run audio mixer in Web Audio context

- Load work parameters from IndexedDB
- Invoke audio-mixer.js
- Monitor progress with callback
- Convert result blob to base64
- Send mix_audio_result message back to service worker
- Cleanup: close mixer, clear IndexedDB, close document

**Key Functions**:
- `initializeAndMix()` - Load data + orchestrate mixer
- `onProgress()` - Progress callback for mixer
- Message listener for mix_audio_result

### Shared Utilities
**Constants** (constants.js): API endpoints, timeouts, token limits, storage keys
**Prompts** (prompts.js): LLM prompt templates, token estimation
**Voice Config** (voice-config.js): Gemini TTS voices, emotion → instruction mapping
**Storage Utils** (storage-utils.js): AES-GCM key management
**Audio Utils** (audio-utils.js): WAV/PCM conversion, buffer operations
**Audio Storage** (audio-storage.js): IndexedDB wrapper for large data transfer
**Message Types** (message-types.js): Message protocol definitions

## Data Flow: End-to-End

```
1. USER INITIATES EXTRACTION
   popup.js → sendMessageWithTimeout(content-script.js)
   ↓
2. CONTENT SCRIPT EXTRACTS
   content-script.js → extractConversation() → return Conversation
   ↓
3. POPUP STORES & TRIGGERS SCRIPT GEN
   popup.js → service-worker.js [CONVERSATION_DATA message]
   → service-worker.js [GENERATE_SCRIPT message]
   ↓
4. SCRIPT GENERATION
   service-worker.js → script-generator.js → gemini-client.js
   ← gemini-client.js ← script-generator.js ← service-worker.js
   storage: chrome.storage.local [currentScript]
   ↓
5. TTS GENERATION
   popup.js [GENERATE_TTS message] → service-worker.js
   → tts-generator.js → gemini-client.js (parallel 3 concurrent)
   service-worker.js caches result in-memory: currentAudioResult
   ↓
6. AUDIO MIXING
   popup.js [MIX_AUDIO message] → service-worker.js
   → runOffscreenMixing():
      a) Store segments + musicUrl to IndexedDB
      b) Create offscreen document
      c) offscreen.js loads IndexedDB
      d) audio-mixer.js:
         - Decode all segments (online context)
         - Render mix (offline context)
         - Convert to WAV
      e) Send mix_audio_result back
   ↓
7. DOWNLOAD
   service-worker.js → triggerDownload()
   → chrome.downloads.download({ url: data URL, filename })
   ↓
8. CLEANUP
   Popup shows completion
   User can "Create Another" → reset state
   All data in storage remains for quick retry
```

## External Integrations

### Google Gemini API
- **Endpoint**: https://generativelanguage.googleapis.com/v1beta/models
- **Auth**: Query parameter `key=` (official Gemini design)
- **Models**:
  - Text: `gemini-2.0-flash` (fast, efficient)
  - TTS: `gemini-2.5-flash-preview-tts` (expressive audio)
- **Rate Limits**: 429 responses → exponential backoff
- **Timeouts**: 30s text, 90s TTS

### Chrome APIs Used
- `chrome.runtime.onMessage` - Message passing
- `chrome.runtime.sendMessage` - Send to service worker
- `chrome.runtime.getContexts` - Detect offscreen
- `chrome.offscreen.createDocument` / `closeDocument` - Lifecycle
- `chrome.storage.local.get/set` - Persistent storage (10MB)
- `chrome.downloads.download` - Trigger downloads

### Web APIs Used
- `AudioContext` / `OfflineAudioContext` - Web Audio API
- `fetch()` - HTTP requests
- `crypto.subtle` - AES-GCM encryption
- `FileReader` - Blob to base64
- `IndexedDB` - Large data transfer

## Security Architecture

### API Key Management
```
User enters key → Settings popup
   ↓
storage-utils.js::saveApiKey()
   ↓
Generate 256-bit AES key (per-install)
Generate 12-byte random IV
Encrypt key with AES-GCM
Store: { data: encrypted, iv: random_iv }
   ↓
chrome.storage.local (sandboxed to extension)
```

### Audio Pipeline
- All processing local (no external uploads)
- Base64 audio in messages (no external storage)
- IndexedDB for inter-process data (not persisted after close)

### Message Validation
- Switch-based type dispatch in service worker
- No sensitive data in message bodies (references only)
- Chrome messaging API prevents cross-context forgery

## Performance Characteristics

| Operation | Duration | Notes |
|-----------|----------|-------|
| Extract (ChatGPT DOM) | 1-2s | Depends on conversation size |
| Script Generation | 5-10s | LLM inference time |
| TTS (per segment) | 1-2s | ~3 segments for typical podcast |
| Audio Mixing (1hr) | 1-5s | OfflineAudioContext renders fast |
| Download | <1s | Data URL, local only |

**Total Pipeline**: ~15-25s for typical 2000-word conversation

## Scalability Considerations

### Current Limits
- Conversation: ~400K chars before chunking
- TTS: ~3500 chars per request
- Audio: Limited by base64 message size (estimates 50MB+)
- Storage: 10MB chrome.storage quota (use IndexedDB for audio)

### Bottlenecks
- TTS is sequential (3 concurrent requests, ~2s per segment)
- Service worker can sleep → lose in-memory audio cache
- No concurrent podcast generation (single promise resolver)

### Future Optimizations
- Implement promise queue for concurrent mixes
- Cache decoded audio buffers (avoid re-decoding)
- Stream WAV export (current: blob → base64 → blob)
- Add telemetry for error rates + performance

---

**Last Updated**: January 19, 2026
