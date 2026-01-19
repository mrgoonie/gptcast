# Code Standards & Development Guidelines

## Naming Conventions

### Files
- **Format**: kebab-case, descriptive names (length is acceptable)
- **Examples**: `service-worker.js`, `audio-mixer.js`, `script-generator.js`, `voice-config.js`
- **Pattern**: `{purpose}-{entity}.js` or `{entity}.js` for utilities

### Variables & Functions
- **Format**: camelCase
- **Examples**: `currentAudioResult`, `generateScript()`, `mixAudio()`, `isProcessing`
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_RETRIES`, `STORAGE_KEYS`)

### Classes
- **Format**: PascalCase
- **Examples**: `GeminiClient`, `ScriptGenerator`, `TTSGenerator`, `AudioMixer`

### DOM Elements & Selectors
- **CSS Classes**: kebab-case (e.g., `processing-view`, `progress-bar`, `error-icon`)
- **IDs**: kebab-case (e.g., `progress-container`, `api-key-input`)
- **Data Attributes**: kebab-case (e.g., `data-message-author-role`, `data-message-id`)

## File Organization

### Structure by Type

**Background Services** (~/src/background/)
```javascript
// Imports (chrome, shared modules)
import { MSG } from '../shared/message-types.js';

// Constants (local to file)
const HANDLER_TIMEOUT = 5000;

// Helper functions (private)
function validateApiKey(key) { }
function sendProgress(stage, progress) { }

// Main class or exported functions
class GeminiClient { }
export { GeminiClient };

// Message listeners (if applicable)
chrome.runtime.onMessage.addListener(handleMessage);
```

**Frontend Controllers** (~/src/popup/)
```javascript
// State variables
let currentView = 'initial';
let conversationData = null;

// Initialization
document.addEventListener('DOMContentLoaded', initializePopup);

// View management
function showView(name) { }

// Message handlers
function handleExtract() { }
function handleGenerate() { }

// Event listeners
document.getElementById('extract-btn').addEventListener('click', handleExtract);
```

**Utilities** (~/src/shared/)
```javascript
// Export constants
export const VOICES = { Puck: '...', Kore: '...' };

// Export functions
export function buildPrompt(conversation, condensed) { }
export function estimateTokens(text) { }
```

### Max File Size
- **Target**: <200 lines for source code
- **Exception**: Templates (HTML), config, tests can exceed
- **Action**: Split if growth adds new responsibility

## Error Handling Patterns

### Try-Catch with User Feedback
```javascript
try {
  const result = await geminiClient.generateContent(prompt);
  return { success: true, data: result };
} catch (error) {
  console.error('[GPTCast SW] Script generation error:', error);
  return { success: false, error: error.message };
}
```

### Graceful Degradation
```javascript
// Partial TTS failure doesn't block pipeline
const audioSegments = [];
for (const segment of scriptSegments) {
  try {
    const audio = await generateSegmentAudio(segment);
    audioSegments.push(audio);
  } catch (error) {
    audioSegments.push({ type: 'error', error: error.message });
  }
}
if (audioSegments.some(s => s.type !== 'error')) {
  // Continue with successful segments
} else {
  // All failed: return error to user
}
```

### Message Safety
```javascript
// Popup may be closed—catch silently
chrome.runtime.sendMessage(progressMessage).catch(() => {});

// Progress callback may fail—continue processing
try { onProgress?.(data); } catch { }
```

### Resource Cleanup
```javascript
try {
  // Main work
  await mixAudio(segments, musicUrl);
} catch (error) {
  throw error;
} finally {
  // Always cleanup
  mixer.cleanup();
  clearWorkData();
  closeOffscreenDoc();
}
```

## Testing Approach

### Test Structure
```javascript
describe('ClassName', () => {
  beforeEach(() => {
    // Setup
    jest.clearAllMocks();
  });

  describe('methodName', () => {
    it('should do X when Y', () => {
      // Arrange
      const input = { ... };

      // Act
      const result = method(input);

      // Assert
      expect(result).toEqual(expected);
    });
  });
});
```

### Mocking Strategy
- **Chrome APIs**: Mock `chrome.runtime`, `chrome.storage`, `chrome.offscreen`, `chrome.downloads`
- **Web APIs**: Mock `fetch`, `AudioContext`, `OfflineAudioContext`, `FileReader`
- **Modules**: Jest mock imports for external dependencies

### Test Coverage Targets
| Module | Target |
|--------|--------|
| Audio Mixer | >90% (critical path) |
| TTS Generator | >85% (API-heavy) |
| Script Generator | >80% (LLM-dependent) |
| Storage Utils | >95% (security) |
| Popup Controller | >70% (UI-driven) |

### Test Files Location
- Colocate with implementation: `service-worker.js` → `__tests__/service-worker.test.js`
- OR separate directory: `src/background/__tests__/service-worker.test.js`

## Chrome Extension MV3 Patterns

### Service Worker Architecture
```javascript
// Register message listener immediately (on load)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender, sendResponse);
  return true; // Keep channel open for async
});

// Long-running operations
async function handleMessage(msg, sender, sendResponse) {
  try {
    const result = await longOperation();
    sendResponse({ success: true, data: result });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}
```

### Offscreen Document Pattern
```javascript
// Service Worker creates offscreen on demand
async function runOffscreenMixing(segments, musicUrl) {
  // Close any existing offscreen
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  for (const context of contexts) {
    await chrome.offscreen.closeDocument(context.documentId);
  }

  // Store work data to IndexedDB
  await storeWorkData(segments, musicUrl);

  // Create offscreen
  await chrome.offscreen.createDocument({
    url: 'src/offscreen/offscreen.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Audio mixing with Web Audio API'
  });

  // Wait for result
  return new Promise((resolve, reject) => {
    mixResultResolve = resolve;
    mixResultReject = reject;
    setTimeout(() => reject(new Error('Mix timeout')), 300000);
  });
}

// Offscreen Document receives result
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'mix_audio_result') {
    mixResultResolve(msg.data);
    chrome.offscreen.closeDocument();
  }
});
```

### Message Passing IPC
```javascript
// Type-safe messages via constants
const MSG = {
  EXTRACT_CONVERSATION: 'EXTRACT_CONVERSATION',
  GENERATE_SCRIPT: 'GENERATE_SCRIPT',
  // ... etc
};

// Sender ensures type safety
chrome.runtime.sendMessage({ type: MSG.GENERATE_SCRIPT, condensed: true });

// Receiver validates
function handleMessage(msg, sender, sendResponse) {
  switch (msg.type) {
    case MSG.GENERATE_SCRIPT:
      handleGenerateScript(msg, sendResponse);
      break;
    default:
      sendResponse({ error: 'Unknown message type' });
  }
  return true;
}
```

### Storage Quota Management
```javascript
// Chrome 10MB limit per extension
// Workaround: Use IndexedDB for large audio data

// Store script (small, ~50KB)
await chrome.storage.local.set({ currentScript: scriptResult });

// Store audio segments (large, 100MB+) to IndexedDB
await storeWorkData(audioSegments, musicUrl);
```

### Content Script Limitations (MV3)
```javascript
// ✗ Cannot import ES modules
// ✗ Cannot access background service worker directly
// ✓ Must use chrome.runtime.sendMessage

// Content script → Service Worker
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'EXTRACT_CONVERSATION') {
    const conversation = extractConversation(document);
    sendResponse({ success: true, data: conversation });
  }
});
```

## Security Patterns

### API Key Encryption (AES-GCM)
```javascript
// Generate + store encryption key
async function getEncryptionKey() {
  let key = localStorage.getItem('gptcast-encryption-key');
  if (!key) {
    const cryptoKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    const exported = await crypto.subtle.exportKey('raw', cryptoKey);
    localStorage.setItem('gptcast-encryption-key', btoa(exported));
  }
  return key;
}

// Encrypt API key with random IV
async function saveApiKey(apiKey) {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(apiKey)
  );
  chrome.storage.local.set({
    apiKey: { data: encrypted, iv: Array.from(iv) }
  });
}

// Decrypt on retrieval
async function getApiKey() {
  const { apiKey: stored } = await chrome.storage.local.get('apiKey');
  if (!stored?.data) return null;
  // ... decrypt and return
}
```

### Message Validation
```javascript
// Validate message structure
function validateMessage(msg) {
  if (!msg.type || !MSG[msg.type]) {
    throw new Error('Invalid message type');
  }
  if (msg.type === MSG.GENERATE_SCRIPT && typeof msg.condensed !== 'boolean') {
    throw new Error('Missing condensed flag');
  }
}
```

### No Sensitive Data in Messages
```javascript
// ✓ Reference stored data
chrome.runtime.sendMessage({ type: MSG.GENERATE_SCRIPT });
// Service Worker retrieves from storage

// ✗ Never embed credentials
// chrome.runtime.sendMessage({ apiKey: secretKey }); // WRONG
```

## Code Quality Standards

### Comments
- **JSDoc** on exported functions: `/** @param {type} name - description */`
- **Inline comments** for complex logic (not obvious code)
- **TODO comments** for known issues: `// TODO: handle concurrent mixes`

### Linting
- No hard syntax errors (must compile)
- Reasonable quality standards that enhance productivity
- Avoid over-enforcing style (focus on readability)

### Readability
- Self-documenting function names: `generatePodcastAudio()` not `run()`
- One concept per function
- Prefer composition over complex nesting

### Performance
- Avoid unnecessary DOM manipulation
- Batch API calls when possible (TTS concurrent requests)
- Use OfflineAudioContext for audio rendering (not real-time)

---

**Last Updated**: January 19, 2026
