# GPTCast Codebase Summary

## Directory Structure

```
gptcast-extension/
├── src/
│   ├── background/              # Service worker + API clients
│   │   ├── service-worker.js    # 438 LOC - Main orchestrator
│   │   ├── gemini-client.js     # 223 LOC - Google Gemini API wrapper
│   │   ├── script-generator.js  # 207 LOC - Conversation → podcast script
│   │   ├── tts-generator.js     # 213 LOC - Script → audio segments
│   │   └── __tests__/           # Unit + integration tests
│   │
│   ├── content/                 # ChatGPT DOM extraction
│   │   ├── content-script.js    # 293 LOC - Content script runner
│   │   ├── dom-parser.js        # 251 LOC - DOM extraction logic (unused in MV3)
│   │   └── selectors.js         # 69 LOC - CSS selectors + helpers
│   │
│   ├── offscreen/               # Web Audio API context
│   │   ├── offscreen.html       # Offscreen document container
│   │   ├── offscreen.js         # 199 LOC - Message handler
│   │   ├── audio-mixer.js       # 348 LOC - Web Audio mixing engine
│   │   └── __tests__/           # Mixer tests
│   │
│   ├── popup/                   # Extension UI
│   │   ├── popup.html           # 152 LOC - Template (6 views)
│   │   ├── popup.css            # 336 LOC - Responsive styles
│   │   └── popup.js             # 303 LOC - View controller + message routing
│   │
│   └── shared/                  # Shared utilities
│       ├── constants.js         # 49 LOC - API keys, TTS config, storage keys
│       ├── message-types.js     # 34 LOC - Message protocol definitions
│       ├── prompts.js           # 73 LOC - LLM prompt templates
│       ├── voice-config.js      # 43 LOC - Voice options + emotion mapping
│       ├── audio-utils.js       # 127 LOC - PCM/WAV conversion, buffer ops
│       ├── storage-utils.js     # 97 LOC - AES-GCM key encryption
│       ├── audio-storage.js     # 50 LOC - IndexedDB abstraction
│       └── __tests__/           # Utility tests
│
├── manifest.json                # MV3 manifest
├── jest.config.js               # Test configuration
└── jest.setup.js                # Test environment setup
```

## File Purpose Mapping

### Background Services
| File | LOC | Purpose | Key Exports |
|------|-----|---------|------------|
| service-worker.js | 438 | Message router + pipeline orchestration | Message handlers for 7 types |
| gemini-client.js | 223 | HTTP wrapper for Google Gemini API | generateContent(), generateTTS() |
| script-generator.js | 207 | LLM-driven conversation → script | generate(), parseScript() |
| tts-generator.js | 213 | Segment → audio via Gemini TTS | generateAudio(), chunkText() |

### Frontend/Content
| File | LOC | Purpose | Key Exports |
|------|-----|---------|------------|
| popup.js | 303 | State machine + UI controller | setupPopup(), handleGenerate() |
| content-script.js | 293 | ChatGPT DOM extraction | extractConversation() |
| dom-parser.js | 251 | Modular DOM extraction (unused) | extractConversation() |
| selectors.js | 69 | CSS selectors + helpers | DOM query utilities |

### Audio Processing
| File | LOC | Purpose | Key Exports |
|------|-----|---------|------------|
| audio-mixer.js | 348 | Web Audio mixing engine | mixAudio(), scheduleMusic() |
| offscreen.js | 199 | Offscreen doc controller | Message listener + mixer runner |
| audio-utils.js | 127 | WAV/PCM conversion | pcmToWav(), base64ToArrayBuffer() |

### Configuration
| File | LOC | Purpose | Key Exports |
|------|-----|---------|------------|
| constants.js | 49 | API endpoints, timeouts, storage keys | API, TTS, AUDIO, STORAGE_KEYS |
| voice-config.js | 43 | Gemini TTS voices + emotions | VOICES, EMOTION_PROMPTS |
| prompts.js | 73 | LLM prompt templates | PODCAST_SCRIPT_PROMPT, buildPrompt() |
| storage-utils.js | 97 | AES-GCM encryption | getApiKey(), saveApiKey() |
| audio-storage.js | 50 | IndexedDB wrapper | getDB(), storeWorkData() |
| message-types.js | 34 | Message protocol | MSG object with 13 types |

## Module Dependencies

```
popup.js
├── content-script.js (via sendMessageWithTimeout)
├── service-worker.js (via chrome.runtime.sendMessage)
└── shared utilities
    ├── message-types.js
    ├── constants.js
    └── storage-utils.js

service-worker.js
├── gemini-client.js
├── script-generator.js
├── tts-generator.js
├── offscreen runner (chrome.offscreen.createDocument)
└── shared utilities
    ├── constants.js
    ├── prompts.js
    ├── audio-storage.js (IndexedDB)
    └── storage-utils.js

audio-mixer.js (offscreen)
└── audio-utils.js
    ├── WAV header generation
    ├── PCM conversion
    └── Base64 handling

gemini-client.js
└── HTTP client (fetch API)

script-generator.js
├── prompts.js
└── constants.js (token limits)

tts-generator.js
├── gemini-client.js (generateTTS)
├── constants.js (TTS config)
└── voice-config.js (emotion prompts)

content-script.js
├── dom-parser.js (logic, not import due to MV3)
└── selectors.js (selectors)
```

## Entry Points

| Context | File | Trigger |
|---------|------|---------|
| **Popup** | popup.js | User clicks extension icon |
| **Content Script** | content-script.js | Injected on ChatGPT pages |
| **Service Worker** | service-worker.js | Browser background process |
| **Offscreen Doc** | offscreen.html + offscreen.js | SW creates via chrome.offscreen.createDocument |

## Data Flow Pipeline

```
User clicks "Extract" (popup.js)
    ↓
sendMessageWithTimeout to content-script.js
    ↓
extractConversation() returns { title, messages, ... }
    ↓
Popup stores via CONVERSATION_DATA message → service-worker.js
    ↓
[Script Generation]
    popup sends GENERATE_SCRIPT
    service-worker → script-generator.js → gemini-client.js
    Returns script with segments + emotion markers
    ↓
[TTS Generation]
    popup sends GENERATE_TTS
    service-worker → tts-generator.js → gemini-client.js
    Returns segments with base64 audio data
    In-memory cache: currentAudioResult
    ↓
[Audio Mixing]
    popup sends MIX_AUDIO
    service-worker → offscreen document + IndexedDB
    offscreen.js loads IndexedDB data
    audio-mixer.js renders final WAV
    Message back to service-worker
    ↓
[Download]
    service-worker.js → chrome.downloads.download()
```

## Key Patterns

### Message Router
Service Worker uses switch-based dispatch for 7 message types (EXTRACT_CONVERSATION, GENERATE_SCRIPT, GENERATE_TTS, MIX_AUDIO, GENERATE_PODCAST, TEST_API_KEY, DOWNLOAD_AUDIO).

### Exponential Backoff Retry
Gemini Client retries on 429 rate limits with formula: `2^attempt * baseDelay`.

### Progress Streaming
Long-running operations (TTS, mixing) invoke `onProgress(data)` callbacks to update UI without blocking.

### Dual AudioContext Architecture
- **Online Context** (decode phase): Real-time decoding of base64 → AudioBuffer
- **Offline Context** (mix phase): CPU-speed rendering (1000x faster than playback)

### Audio Ducking via Gain Ramping
Music gain linearly transitions: `normalVolume → duckVolume` during speech, reverse after.

### Chunking at Boundaries
- **Script**: Message-level splits (preserve context)
- **Text**: Sentence-level splits (preserve meaning)
- **Fallback**: Word-level splits (hard truncate)

## Configuration Points

| Group | Key Examples |
|-------|--------------|
| API | GEMINI_MODEL, GEMINI_TTS_MODEL, MAX_RETRIES, TIMEOUT_TEXT_MS, TIMEOUT_TTS_MS |
| TTS | SAMPLE_RATE (24000), CHANNELS (1), MAX_CHARS_PER_REQUEST (3500), CONCURRENT_REQUESTS (3) |
| Audio | MUSIC_VOLUME (0.4), MUSIC_DUCK_VOLUME (0.15), DUCK_RAMP_TIME (0.3) |
| Storage | API_KEY, ENCRYPTION_KEY, CURRENT_CONVERSATION, CURRENT_SCRIPT, CURRENT_AUDIO |

## Total Codebase Metrics

- **Total LOC**: ~3100 (source only, excl. tests)
- **Test LOC**: ~1200 (unit + integration tests)
- **Files**: 20 source files + 8 test files
- **Test Coverage**: Audio mixer, TTS, utils (aim for >80%)
- **Dependencies**: Zero npm packages (vanilla JS + Chrome APIs)

---

**Last Updated**: January 19, 2026
