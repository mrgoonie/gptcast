# Scout Report: Frontend & Shared Utilities Analysis

**Date:** 2026-01-19  
**Report ID:** scout-260119-1857  
**Focus:** Frontend UI, DOM extraction, content scripts, shared utilities

---

## 1. Module Overview

### Frontend Layer
| File | LOC | Purpose |
|------|-----|---------|
| `popup.js` | 303 | Main UI controller; handles 6-view state machine & inter-process messaging |
| `popup.html` | 152 | Extension popup template (360px width, 6 distinct sections) |
| `popup.css` | 336 | Responsive styling with CSS variables & animations |

### Content Script Layer
| File | LOC | Purpose |
|------|-----|---------|
| `content-script.js` | 293 | Runs on ChatGPT pages; extracts conversation DOM with primary + fallback strategies |
| `dom-parser.js` | 251 | Module exporting DOM extraction logic (ES6 modules; duplicates content-script.js logic) |
| `selectors.js` | 69 | CSS selectors & utility functions for DOM parsing |

### Shared Utilities Layer
| File | LOC | Purpose |
|------|-----|---------|
| `constants.js` | 49 | API keys, TTS config, audio mixing params, storage keys |
| `message-types.js` | 34 | Message routing protocol for 5-component communication |
| `prompts.js` | 73 | LLM prompt templates + token estimation |
| `voice-config.js` | 43 | Gemini TTS voices & emotion-to-prompt mapping |
| `audio-utils.js` | 127 | PCM↔WAV conversion, WAV header generation, buffer operations |
| `storage-utils.js` | 97 | AES-GCM encryption for API key storage |
| `audio-storage.js` | 50 | IndexedDB abstraction for large audio segment transfer |

---

## 2. Key Functions & Classes

### popup.js

**State Management:**
- `currentView: string` - Active view name (6 states)
- `conversationData: object|null` - Extracted conversation metadata
- `isProcessing: boolean` - Prevents concurrent generation

**View Map:**
```
initial → preview → processing → complete
                   ↓
                  error
         ↓
      settings → initial
```

**Core Functions:**
- `checkApiKey()` - Verifies stored API key; disables/enables extract button
- `sendMessageWithTimeout(tabId, message, timeout)` → Promise - Chrome IPC with 5s default timeout
- `handleExtract()` - Initiates content script extraction via `MSG.EXTRACT_CONVERSATION`; stores in local storage
- `handleGenerate()` - Orchestrates 3-step pipeline:
  1. `MSG.GENERATE_SCRIPT` → script generation
  2. `MSG.GENERATE_TTS` → audio generation
  3. `MSG.GENERATE_PODCAST` → audio mixing
- `handleCancel()` - Cancels ongoing generation
- `handleSaveKey()` / `handleTestKey()` - Settings management
- `updateProgress(stage, progress, detail)` - Updates progress bar & status text from service worker messages
- `showView(viewName)` - CSS class toggle for view switching
- `setupProgressListener()` - Registers onMessage handler for `MSG.PROGRESS_UPDATE`

**Parameters & Return Types:**
- `sendMessageWithTimeout`: (tabId: number, message: object, timeout?: number) → Promise<response: object>
- Message handlers: void (use sendResponse callback)

### popup.html / popup.css

**UI Structure (6 Views):**
1. **Initial** - Extract button + hint text
2. **Preview** - Title, message count, 3 select dropdowns (voice, music, condensed mode), generate button
3. **Processing** - Progress bar, stage text, spinner, cancel button
4. **Complete** - Success icon, download/start-over buttons
5. **Error** - Error icon, message, retry/start-over buttons
6. **Settings** - API key input (password), test button, toggle visibility, back button

**Key CSS Features:**
- 360px fixed popup width (Chrome extension constraint)
- CSS custom properties for theming (primary: `#6366f1`, success: `#10b981`, error: `#ef4444`)
- Accent-color for checkboxes
- Animation: `spin` keyframe for spinner (1s linear infinite)
- Focus states with box-shadow

### content-script.js

**Note:** Chrome MV3 limitation: cannot use ES modules. Logic is duplicated from `dom-parser.js`.

**DOM Selectors (ChatGPT-specific):**
```javascript
SELECTORS = {
  messageRoles: '[data-message-author-role]',           // Primary
  messageId: '[data-message-id]',
  assistantContent: '.markdown',
  userContent: '.whitespace-pre-wrap',
  fallback: {
    turnContainer: '[data-testid="conversation-turn"]',
    messages: '[class*="agent-turn"], [class*="human-turn"]',
    userMessage: '[class*="user"], [class*="human"]',
    assistantMessage: '[class*="assistant"], [class*="agent"], [class*="gpt"]'
  },
  exclude: {
    codeToolbar: '.code-toolbar, [class*="code-toolbar"]',
    copyButton: '[class*="copy"], button[aria-label*="Copy"]',
    actionButtons: '[class*="action"], [class*="btn"]',
    metadata: '[class*="timestamp"], [class*="avatar"]'
  }
}
```

**Core Extraction Flow:**
1. `extractConversation()` - Main entry point
2. Query `[data-message-author-role]` elements (primary method)
3. For each element:
   - `getMessageRole(element)` → 'user' | 'assistant' | null
   - `extractContent(element, role)` → text from role-specific selectors
   - `cleanContent(text)` → normalize whitespace, remove copy artifacts, normalize quotes
4. Fallback: if no messages found, try `[data-testid="conversation-turn"]`, then class-based selectors

**Message Structure:**
```javascript
{
  id: string,              // data-message-id or fallback-{index}
  role: 'user' | 'assistant',
  content: string,         // cleaned text
  timestamp: number        // insertion order
}
```

**Returned Conversation Object:**
```javascript
{
  title: string,           // Extracted from document.title or first user message
  messages: Message[],
  extractedAt: ISO8601,
  url: string,
  messageCount: number,
  usedFallback?: boolean
}
```

**Message Handler:**
- Listens for `MSG.EXTRACT_CONVERSATION`
- Returns `{ success: boolean, data?: conversation, error?: string }`

### dom-parser.js / selectors.js

**Same logic as content-script.js but modularized:**
- `extractConversation()` - Exports main function
- `getMessageRole(element)` → 'user' | 'assistant' | null (with data-attr, class, and ancestor fallbacks)
- `shouldExclude(element)` → boolean
- Helper functions: `extractTitle()`, `getMessageId()`, `extractContent()`, `extractTextContent()`, `cleanContent()`, `determineRoleFromContent()`, `extractWithFallback()`

**Note:** This module is currently unused in content-script.js due to MV3 module limitations.

---

## 3. UI Components & Flow

### User Journey

```
[Initial View]
  ↓ (API key check on load)
  ├─ No API key → Show "Configure Settings"
  └─ Has API key → Show "Extract Conversation"
    ↓ (click Extract)
    [Preview View]
    ├─ Shows conversation title & message count
    ├─ Options:
    │  ├─ Voice (5 options: Puck, Kore, Charon, Fenrir, Aoede)
    │  ├─ Music (4 options: calm, upbeat, ambient, none)
    │  └─ Condensed mode (checkbox)
    ├─ [Generate] button → [Processing]
    └─ [Cancel] → [Initial]
    
    [Processing View]
    ├─ Progress bar (0-100%)
    ├─ Stage text (e.g., "Crafting podcast script...")
    ├─ Detail text (custom messages from SW)
    ├─ Spinner animation
    └─ [Cancel] → [Preview]
    
    [Complete View]
    ├─ Success icon
    ├─ "Podcast Ready!" message
    ├─ [Download Again] → triggers MSG.DOWNLOAD_AUDIO
    └─ [Create Another] → [Initial]
    
    [Error View]
    ├─ Error icon
    ├─ Error message (from service worker)
    ├─ [Try Again] → [Preview] + handleGenerate()
    └─ [Start Over] → [Initial]

[Settings View]
├─ API key input (password field)
├─ [Test API] → MSG.TEST_API_KEY
├─ [Save Key] → saveApiKey() + localStorage
└─ [Back] → checks API key, returns [Initial]
```

### Message Flow

**Popup ↔ Service Worker:**
```
MSG.EXTRACT_CONVERSATION
├─ Sent TO: content script (via sendMessageWithTimeout)
└─ Response: { success: bool, data: conversation | error: string }

MSG.CONVERSATION_DATA
├─ Sent TO: service worker
└─ Data: conversation object (for storage)

MSG.GENERATE_SCRIPT
├─ Sent TO: service worker
└─ Response: { success: bool, data?: script, error?: string }

MSG.GENERATE_TTS
├─ Sent TO: service worker
├─ Params: { voice: string }
└─ Response: { success: bool, data?: audioChunks, error?: string }

MSG.GENERATE_PODCAST
├─ Sent TO: service worker
├─ Params: { musicMood: string }
└─ Response: { success: bool, error?: string }

MSG.TEST_API_KEY
├─ Sent TO: service worker
└─ Response: { success: bool, error?: string }

MSG.DOWNLOAD_AUDIO
├─ Sent TO: service worker
└─ Effect: Downloads cached audio file

MSG.PROGRESS_UPDATE
├─ Sent FROM: service worker
├─ Params: { stage: string, progress: 0-100, detail: string }
└─ Effect: Updates progress UI
```

---

## 4. DOM Extraction Logic

### Extraction Strategy (Layered Approach)

**Layer 1: Primary Selectors (Most Reliable)**
- `[data-message-author-role]` → high confidence attributes
- `[data-message-id]` → unique message IDs
- `.markdown` → assistant responses in markdown container
- `.whitespace-pre-wrap` → user input formatting

**Layer 2: Fallback Selectors (DOM Structure Changes)**
- `[data-testid="conversation-turn"]` → conversation turn containers
- `[class*="agent-turn"], [class*="human-turn"]` → class-based detection
- `[class*="user"], [class*="human"]` → user message classes
- `[class*="assistant"], [class*="agent"], [class*="gpt"]` → assistant classes

**Layer 3: Last Resort**
- Generic: `[class*="message"], [class*="turn"]`
- Analyzes `className` for 'user', 'assistant', 'agent' keywords

### Text Extraction Process

1. **TreeWalker Traversal:**
   - Clone DOM subtree (avoid mutations)
   - Remove excluded elements (buttons, metadata, toolbars)
   - Walk text nodes only (`NodeFilter.SHOW_TEXT`)
   - Skip parent-excluded nodes

2. **Cleaning Pipeline:**
   ```javascript
   text
     .replace(/\s+/g, ' ')           // Normalize whitespace
     .trim()
     .replace(/^Copy(code)?/gi, '')  // Remove copy button artifacts
     .replace(/Copy$/gi, '')
     .replace(/[""]/g, '"')          // Normalize Unicode quotes
     .replace(/['']/g, "'")
     .replace(/  +/g, ' ')           // Final space collapse
     .trim()
   ```

3. **Role Determination:**
   - Primary: `data-message-author-role` attribute
   - Secondary: Class-based detection (case-insensitive substring match)
   - Tertiary: Ancestor `data-message-author-role` lookup

### Fallback Mechanism

**Trigger:** When `[data-message-author-role]` returns 0 results

**Process:**
1. Query `[data-testid="conversation-turn"]`
2. If empty, try `[class*="agent-turn"]` + class patterns
3. If still empty, generic message/turn selectors
4. For each element, determine role from content (heuristic)
5. Mark output with `usedFallback: true`

### Robustness Features

- **Title Extraction:** document.title → remove ChatGPT suffix → first user message (60 char limit) → "Untitled Conversation"
- **Empty Message Filtering:** Post-extraction cleanup removes whitespace-only messages
- **Message ID Fallback:** `data-message-id` → sequential `msg-{index}`
- **Error Handling:** Try-catch with detailed error messages returned to UI

---

## 5. Shared Utilities

### constants.js

```javascript
API = {
  GEMINI_BASE: 'https://generativelanguage.googleapis.com/v1beta/models',
  GEMINI_MODEL: 'gemini-2.0-flash',          // Text generation
  GEMINI_TTS_MODEL: 'gemini-2.5-flash-preview-tts',  // Audio generation
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
  TIMEOUT_TEXT_MS: 30000,       // 30s for script generation
  TIMEOUT_TTS_MS: 60000,        // 60s for audio generation
  MAX_TOKENS_BEFORE_CHUNKING: 100000,  // ~400K chars
  MAX_TOKENS_PER_CHUNK: 50000         // ~200K chars
}

TTS = {
  SAMPLE_RATE: 24000,
  CHANNELS: 1,
  BITS_PER_SAMPLE: 16,
  MAX_CHARS_PER_REQUEST: 3500,
  CONCURRENT_REQUESTS: 3
}

AUDIO = {
  MUSIC_VOLUME: 0.4,
  MUSIC_DUCK_VOLUME: 0.15,
  DUCK_RAMP_TIME: 0.3             // Seconds for ducking ramp
}

STORAGE_KEYS = {
  API_KEY: 'apiKey',
  ENCRYPTION_KEY: 'gptcast-encryption-key',
  CURRENT_CONVERSATION: 'currentConversation',
  CURRENT_SCRIPT: 'currentScript',
  CURRENT_AUDIO: 'currentAudio',
  SETTINGS: 'settings'
}
```

### message-types.js

```javascript
MSG = {
  // Extraction
  EXTRACT_CONVERSATION,
  CONVERSATION_DATA,
  
  // Generation
  GENERATE_SCRIPT, SCRIPT_READY,
  GENERATE_TTS, TTS_CHUNK_READY,
  MIX_AUDIO, MIX_AUDIO_OFFSCREEN,  // SW ↔ offscreen
  OFFSCREEN_READY,                 // Offscreen → SW
  AUDIO_READY,
  
  // Full pipeline
  GENERATE_PODCAST,
  DOWNLOAD_AUDIO,
  
  // Status
  PROGRESS_UPDATE,
  ERROR,
  
  // Settings
  TEST_API_KEY
}
```

### prompts.js

**Template System:**
- `PODCAST_SCRIPT_PROMPT` - Full script generation (2-5 min output)
- `CONDENSED_PROMPT` - Brief segment (1-2 min output)

**Emotion Markers:**
```
[HOST/EXCITED] [HOST/CURIOUS] [HOST/THOUGHTFUL] [HOST/EMPHATIC] [HOST/WARM]
[PAUSE:1] [PAUSE:2]  // Pause in seconds
```

**Script Structure:**
1. Hook (first 10 seconds)
2. Setup (context)
3. Journey (key insights as narrative)
4. Takeaways (conclusions)
5. Close (sign-off)

**Exports:**
- `buildPrompt(conversation, condensed?: boolean) → string` - Formats conversation + template
- `estimateTokens(text) → number` - Rough: ~4 chars per token

### voice-config.js

**Voices (Gemini TTS prebuilt):**
```javascript
VOICES = {
  Puck: 'Upbeat, energetic',
  Kore: 'Firm, authoritative',
  Charon: 'Warm, friendly',
  Fenrir: 'Deep, contemplative',
  Aoede: 'Bright, cheerful'
}
```

**Emotion Mapping:**
```javascript
EMOTION_PROMPTS = {
  excited: 'Say with high energy, enthusiasm, and genuine excitement',
  curious: 'Say with questioning intonation, wonder, and intrigue',
  thoughtful: 'Say slowly and reflectively, with pauses for emphasis',
  emphatic: 'Say with strong conviction, emphasis, and authority',
  warm: 'Say in a friendly, conversational, welcoming tone',
  neutral: 'Say clearly and naturally, like a professional narrator'
}
```

**Functions:**
- `buildTTSPrompt(text, emotion) → string`
- `getVoiceOptions() → [{ value, label }]`

### audio-utils.js

**Conversions:**
- `base64ToArrayBuffer(base64) → ArrayBuffer`
- `arrayBufferToBase64(buffer) → string`

**WAV Construction:**
- `createWavHeader(dataLength, sampleRate?, channels?, bitsPerSample?) → ArrayBuffer`
  - Writes: RIFF header, fmt chunk, data chunk (44 bytes)
- `pcmToWav(pcmData, ...) → ArrayBuffer`
  - Concatenates header + PCM data

**Buffer Operations:**
- `generateSilenceBuffer(durationSeconds, ...) → ArrayBuffer`
- `mergeArrayBuffers(buffers[]) → ArrayBuffer`

**WAV Header Format:**
```
Offset | Field         | Size | Value
-------|---------------|------|----------
0      | RIFF          | 4    | "RIFF"
4      | File size - 8 | 4    | Little-endian
8      | WAVE          | 4    | "WAVE"
12     | "fmt "        | 4    | Subchunk1ID
16     | Subchunk1Size | 4    | 16
20     | Audio format  | 2    | 1 (PCM)
22     | Channels      | 2    | 1 or 2
24     | Sample rate   | 4    | 24000 Hz
28     | Byte rate     | 4    | sampleRate * channels * bytesPerSample
32     | Block align   | 2    | channels * bytesPerSample
34     | Bits/sample   | 2    | 16
36     | "data"        | 4    | Subchunk2ID
40     | Data size     | 4    | PCM data length
44     | [PCM data]    | N    |
```

### storage-utils.js

**Encryption (AES-GCM):**

1. **Key Management:**
   - `getEncryptionKey()` - Generate (if new) or retrieve stored key
     - Generates 256-bit AES-GCM key
     - Exports to raw format, stores as `Uint8Array` in localStorage
     - Re-imports as CryptoKey on next access

2. **API Key Storage:**
   - `saveApiKey(apiKey)` - Encrypts with random IV, stores
     ```javascript
     {
       data: Uint8Array[],  // Encrypted ciphertext
       iv: Uint8Array[]     // Random 12-byte IV
     }
     ```
   - `getApiKey()` - Decrypts using stored IV + key
   - `hasApiKey()` - Boolean check
   - `clearApiKey()` - Removes encrypted key

3. **Error Handling:**
   - `getApiKey()` returns `null` on decryption failure (catch block)

**Security Pattern:**
- 12-byte random IV per encryption (prevents identical ciphertexts)
- AES-GCM provides authenticated encryption (detects tampering)
- IV stored alongside ciphertext (required for decryption)
- Never stores plaintext API key

### audio-storage.js

**IndexedDB Schema:**
- DB Name: `gptcast-audio`
- Version: 1
- Object Store: `segments` (keyValue store)

**API:**
- `getDB()` - Lazy initialization, caches promise
  - `onupgradeneeded` creates store if missing
- `storeWorkData(segments[], musicUrl) → Promise`
  - Stores under key `'work'`
  - Read by offscreen document on load

**Use Case:**
- Large audio data transfer between service worker ↔ offscreen document
- Bypasses message size limits (Chrome 1MB+ limit)

---

## 6. Configuration & Constants

### API Configuration

| Constant | Value | Purpose |
|----------|-------|---------|
| `GEMINI_MODEL` | gemini-2.0-flash | Text generation (script) |
| `GEMINI_TTS_MODEL` | gemini-2.5-flash-preview-tts | Audio generation |
| `MAX_RETRIES` | 3 | Retry policy on API failures |
| `TIMEOUT_TEXT_MS` | 30000 | Script generation timeout |
| `TIMEOUT_TTS_MS` | 60000 | Audio generation timeout |
| `MAX_TOKENS_BEFORE_CHUNKING` | 100000 | ~400K chars before splitting |
| `MAX_TOKENS_PER_CHUNK` | 50000 | ~200K chars per request |

### TTS Configuration

| Constant | Value | Purpose |
|----------|-------|---------|
| `SAMPLE_RATE` | 24000 Hz | 24 kHz audio |
| `CHANNELS` | 1 | Mono audio |
| `BITS_PER_SAMPLE` | 16 | 16-bit PCM |
| `MAX_CHARS_PER_REQUEST` | 3500 | Per-request char limit |
| `CONCURRENT_REQUESTS` | 3 | Parallel TTS requests |

### Audio Mixing

| Constant | Value | Purpose |
|----------|-------|---------|
| `MUSIC_VOLUME` | 0.4 | Full music volume |
| `MUSIC_DUCK_VOLUME` | 0.15 | Reduced during speech |
| `DUCK_RAMP_TIME` | 0.3 | Fade duration (seconds) |

---

## 7. Security Patterns

### API Key Protection

1. **Encrypted Storage (AES-GCM):**
   - 256-bit symmetric key generated per extension install
   - API key never stored in plaintext
   - Unique 12-byte IV per encryption (prevents rainbow tables)
   - Authenticated encryption detects tampering

2. **Secure Retrieval:**
   - `getApiKey()` returns `null` on decryption failure
   - Graceful fallback to settings prompt if missing

3. **Secure Input:**
   - Settings view uses `<input type="password">`
   - Toggle visibility button (type switching)
   - Input value cleared after save

### Conversation Data

- Stored in `chrome.storage.local` (unencrypted, but sandboxed to extension)
- Transient (cleared on new extraction)
- User-controlled deletion via "Start Over"

### Message Passing

- Chrome messaging API prevents cross-context forgery
- Service worker filters message types
- No sensitive data in message bodies (only references to stored data)

---

## 8. Code Quality Notes

### Patterns & Best Practices

**✓ Good Patterns:**
- View state machine (initial → preview → processing → complete/error)
- Layered DOM extraction (primary → fallback → last resort)
- Encrypted API key storage with random IV
- Message timeout handling with cleanup
- Progress update streaming (not blocking UI)
- Modular shared utilities with single responsibilities
- ES6 module exports for reusability
- Constant centralization (avoids magic numbers)
- WAV header construction (bitwise operations clean)

**⚠ Anti-patterns / Issues:**

1. **Content Script Duplication:**
   - `content-script.js` duplicates `dom-parser.js` + `selectors.js` logic
   - Reason: Chrome MV3 doesn't support ES modules in content scripts
   - Risk: Code drift if DOM extraction updated only in one place
   - Mitigation: Comment reminding maintainers to sync both files

2. **Async Error Handling:**
   - `storage-utils.js::getApiKey()` swallows all decryption errors (catch without re-throw)
   - Could mask real failures (network, permission issues)
   - Current: Returns `null` (acceptable for optional value)

3. **Popup Message Timeout:**
   - Fixed 5s default timeout for content script extraction
   - Some conversations may take longer (large DOM)
   - Mitigation: Increased to 10s for extract, but no exponential backoff

4. **No Message Versioning:**
   - Message types are strings with no version field
   - Future API changes could break backward compatibility
   - Current: Acceptable for single-version extension

5. **IndexedDB Singleton Pattern:**
   - `audio-storage.js` uses promise singleton (`dbPromise`)
   - No cleanup/closing of database connection
   - Current: Acceptable for extension lifetime

### Code Quality Metrics

- **Files under 350 LOC:** ✓ All files modular (max 336 LOC in popup.css)
- **Naming Convention:** ✓ Kebab-case files, camelCase functions/variables
- **Error Handling:** ✓ Try-catch in extraction, silent failures in storage
- **Documentation:** ✓ JSDoc comments on all exported functions
- **Comments:** ✓ Clear intent, not over-commented

### Notable Implementations

1. **TreeWalker for DOM Extraction:**
   - More efficient than recursive descent for large DOMs
   - Respects exclusion rules without full traversal

2. **WAV Header Generation:**
   - Bitwise DataView operations (clean, efficient)
   - Correctly calculates byte rates for any format

3. **Emotion-to-Prompt Mapping:**
   - Declarative EMOTION_PROMPTS object (easy to extend)
   - Neutral fallback prevents runtime errors

4. **IndexedDB Lazy Initialization:**
   - Promise caching avoids multiple open() calls
   - Clean upgrade handler pattern

---

## 9. Unresolved Questions / Future Considerations

1. **DOM Selector Maintenance:**
   - How are `[data-message-author-role]` selectors monitored for ChatGPT changes?
   - Should establish automated selector validation tests?

2. **Error Telemetry:**
   - No error tracking/logging to backend
   - Errors only surfaced to user UI
   - Consider error reporting for debugging extraction failures?

3. **Large Conversation Handling:**
   - Max tokens before chunking set to 100K, but no user warning
   - UI should indicate if conversation will be chunked/truncated?

4. **Audio Storage Cleanup:**
   - IndexedDB segments never deleted
   - Consider TTL or manual cleanup?

5. **Content Script Timing:**
   - Extract endpoint fires immediately on user click
   - No prefetching or background extraction possible
   - Architecture allows future optimization?

