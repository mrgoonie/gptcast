# Phase 1 Developer Instructions

**Start Date:** 2026-01-18
**Duration:** 2 hours (1.5h with parallelization)
**Effort Level:** Beginner-friendly (mostly boilerplate + config)
**Tech Stack:** Chrome MV3, JavaScript ES6 modules, HTML5, CSS3

---

## Pre-Start Checklist

- [ ] Read full phase plan: `./phase-01-extension-scaffold.md`
- [ ] Read this developer instructions doc
- [ ] Confirm Chrome browser available (v88+)
- [ ] Confirm ai-multimodal skill available for icon generation
- [ ] Create working directory: `gptcast-extension/`
- [ ] Initialize git repo if needed

---

## Step-by-Step Execution (Optimal Order)

### Step 1: Create Folder Structure (5 min) - FOUNDATION

**Command:**
```bash
cd D:\www\gptcast
mkdir -p gptcast-extension/src/{background,content,offscreen,popup,shared} \
         gptcast-extension/assets/icons \
         gptcast-extension/lib
```

**Verify:**
```bash
tree gptcast-extension
# Should show:
# gptcast-extension/
# ├── assets/
# │   └── icons/
# ├── lib/
# └── src/
#     ├── background/
#     ├── content/
#     ├── offscreen/
#     ├── popup/
#     └── shared/
```

**Acceptance:** All 3 asset dirs + all src subdirs exist ✓

---

### Step 2: Create message-types.js (5 min) - UNBLOCKING

**File:** `gptcast-extension/src/shared/message-types.js`

**Content:**
```javascript
/**
 * Centralized message type definitions for Chrome extension communication
 * Ensures consistency across content script, service worker, and offscreen document
 */

export const MSG = {
  // Content Script → Service Worker
  EXTRACT_CONVERSATION: 'extract_conversation',

  // Content Script → Service Worker (response)
  CONVERSATION_DATA: 'conversation_data',

  // Popup/Service Worker → Service Worker (forward to Gemini)
  GENERATE_SCRIPT: 'generate_script',

  // Service Worker → Popup (when script ready)
  SCRIPT_READY: 'script_ready',

  // Service Worker → Offscreen
  GENERATE_TTS: 'generate_tts',

  // Offscreen → Service Worker (per chunk)
  TTS_CHUNK_READY: 'tts_chunk_ready',

  // Service Worker → Offscreen (audio mixing)
  MIX_AUDIO: 'mix_audio',

  // Offscreen → Service Worker (mixed audio ready)
  AUDIO_READY: 'audio_ready',

  // Any component → Popup (status updates)
  PROGRESS_UPDATE: 'progress_update',

  // Any component → Any (error broadcast)
  ERROR: 'error'
};
```

**Verify:**
```bash
grep -c "MSG\." gptcast-extension/src/shared/message-types.js
# Should show: 10
```

**Acceptance:** All 10 message types exported, no syntax errors ✓

---

### Step 3: Parallel Phase - Tasks 2, 4, 11 (Foundation files)

#### Task 3a: manifest.json (15 min)

**File:** `gptcast-extension/manifest.json`

**Content:** (Use exact JSON from phase plan, lines 81-125)

**Verify:**
```bash
# Validate JSON syntax
node -e "console.log(JSON.stringify(require('./gptcast-extension/manifest.json'), null, 2))"
# Or use jq if available:
jq . gptcast-extension/manifest.json
```

**Key Checks:**
- ✓ manifest_version: 3
- ✓ permissions: ["activeTab", "storage", "offscreen"]
- ✓ host_permissions includes all 3 domains
- ✓ background.type: "module"
- ✓ All icon paths reference assets/icons/

**Acceptance:** JSON valid, no MV2 APIs present ✓

---

#### Task 3b: constants.js (5 min)

**File:** `gptcast-extension/src/shared/constants.js`

**Content:**
```javascript
/**
 * Shared constants used across extension components
 * Centralize configuration for easy maintenance
 */

// API Configuration
export const API_CONFIG = {
  GEMINI_API_BASE: 'https://generativelanguage.googleapis.com/v1beta/models',
  GEMINI_MODEL_FLASH: 'gemini-1.5-flash',
  GEMINI_MODEL_TTS: 'gemini-2.0-flash-exp', // For TTS if available
  REQUEST_TIMEOUT_MS: 30000,
};

// Storage Keys (chrome.storage.local)
export const STORAGE_KEYS = {
  API_KEY: 'gemini_api_key_encrypted',
  USER_PREFERENCES: 'user_preferences',
  CACHE_CONVERSATIONS: 'cached_conversations',
};

// UI Configuration
export const UI_CONFIG = {
  POPUP_WIDTH: 400,
  POPUP_HEIGHT: 500,
  DEFAULT_MOOD: 'neutral',
  MOODS: ['calm', 'upbeat', 'dramatic', 'neutral'],
};

// Audio Configuration (for Phase 5)
export const AUDIO_CONFIG = {
  SAMPLE_RATE: 44100,
  CHANNELS: 2,
  BIT_DEPTH: 16,
  MUSIC_VOLUME: 0.3,
  SPEECH_VOLUME: 1.0,
};

// Limits & Constraints
export const LIMITS = {
  MAX_CONVERSATION_LENGTH: 10000, // characters
  MAX_SCRIPT_LENGTH: 5000, // characters
  MIN_API_KEY_LENGTH: 30,
};
```

**Verify:**
```bash
grep -c "export const" gptcast-extension/src/shared/constants.js
# Should show: 5
```

**Acceptance:** 5 config sections exported, no syntax errors ✓

---

#### Task 3c: Generate Icons (10 min)

**Need:** 4 PNG files - 16, 32, 48, 128 pixel sizes with microphone + chat bubble theme

**Option A: Use ai-multimodal skill**
```
Prompt: "Generate 4 PNG icon files (16x16, 32x32, 48x48, 128x128 pixels)
with microphone and chat bubble motif. Chrome extension icons.
Create files: icon-16.png, icon-32.png, icon-48.png, icon-128.png"
```

**Option B: Use placeholder shapes (if ai-multimodal unavailable)**
```bash
# Use ImageMagick or manual tool to create:
# - Simple geometric design
# - Microphone symbol + speech bubble
# - Save as PNG to assets/icons/icon-*.png
```

**Option C: Temporary placeholder**
```bash
# Create minimal valid PNGs (1x1 transparent) for testing:
python3 -c "
from PIL import Image
for size in [16, 32, 48, 128]:
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    img.save(f'gptcast-extension/assets/icons/icon-{size}.png')
"
```

**Verify:**
```bash
ls -lh gptcast-extension/assets/icons/icon-*.png
# Should show 4 files, each > 0 bytes
file gptcast-extension/assets/icons/icon-*.png
# Should all be PNG image data
```

**Acceptance:** All 4 PNG files exist, valid image format ✓

---

### Step 4: Parallel Phase - Tasks 5, 6, 9, 10 (Core Components - need Task 2 done first)

#### Task 4a: service-worker.js (20 min)

**File:** `gptcast-extension/src/background/service-worker.js`

**Content:** (Use exact code from phase plan, lines 144-186)

```javascript
import { MSG } from '../shared/message-types.js';

let offscreenDocumentCreated = false;

async function ensureOffscreenDocument() {
  if (offscreenDocumentCreated) return;

  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existingContexts.length > 0) {
    offscreenDocumentCreated = true;
    return;
  }

  await chrome.offscreen.createDocument({
    url: 'src/offscreen/offscreen.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Audio mixing and export for podcast generation'
  });
  offscreenDocumentCreated = true;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(message, sender, sendResponse) {
  switch (message.type) {
    case MSG.CONVERSATION_DATA:
      // Will be implemented in Phase 3
      sendResponse({ success: true });
      break;
    default:
      sendResponse({ error: 'Unknown message type' });
  }
}
```

**Verify:**
```bash
# Check imports resolve (syntax check in IDE)
# Should have no import/export errors
```

**Acceptance:**
- ✓ Imports MSG from message-types.js
- ✓ ensureOffscreenDocument() function exists
- ✓ chrome.runtime.onMessage.addListener present
- ✓ Returns true for async handling ✓

---

#### Task 4b: popup.html (10 min)

**File:** `gptcast-extension/src/popup/popup.html`

**Content:** (Use exact HTML from phase plan, lines 189-220)

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="container">
    <header>
      <h1>GPTCast</h1>
      <p class="subtitle">ChatGPT to Podcast</p>
    </header>

    <main id="main-content">
      <div id="status">Ready to extract conversation</div>
      <button id="extract-btn" class="primary-btn">
        Extract Conversation
      </button>
    </main>

    <footer>
      <button id="settings-btn" class="icon-btn" title="Settings">
        Settings
      </button>
    </footer>
  </div>
  <script src="popup.js" type="module"></script>
</body>
</html>
```

**Verify:**
```bash
grep -c "id=" gptcast-extension/src/popup/popup.html
# Should show: at least 4 (main-content, status, extract-btn, settings-btn)
```

**Acceptance:**
- ✓ Valid HTML5 structure
- ✓ All required IDs present
- ✓ popup.js loaded as module ✓

---

#### Task 4c: popup.css (10 min)

**File:** `gptcast-extension/src/popup/popup.css`

**Content:**
```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  width: 400px;
  background: #f5f5f5;
  color: #333;
}

.container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 16px;
}

header {
  text-align: center;
  margin-bottom: 24px;
  border-bottom: 2px solid #e0e0e0;
  padding-bottom: 12px;
}

header h1 {
  font-size: 24px;
  font-weight: 600;
  color: #1976d2;
}

header .subtitle {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}

main {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 16px;
}

#status {
  padding: 12px;
  background: #e3f2fd;
  border-radius: 4px;
  font-size: 14px;
  text-align: center;
  color: #1565c0;
}

.primary-btn {
  padding: 12px 24px;
  background: #1976d2;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.primary-btn:hover {
  background: #1565c0;
}

.primary-btn:active {
  transform: scale(0.98);
}

footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 12px;
  border-top: 1px solid #e0e0e0;
}

.icon-btn {
  padding: 8px 12px;
  background: none;
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: border-color 0.2s;
}

.icon-btn:hover {
  border-color: #999;
}
```

**Verify:**
```bash
# CSS syntax check - view in browser or IDE validator
# Should have no syntax errors
```

**Acceptance:**
- ✓ Valid CSS3 syntax
- ✓ Styles defined for all HTML elements
- ✓ Button styling present ✓

---

#### Task 4d: popup.js (15 min)

**File:** `gptcast-extension/src/popup/popup.js`

**Content:**
```javascript
import { MSG } from '../shared/message-types.js';

// DOM elements
const extractBtn = document.getElementById('extract-btn');
const settingsBtn = document.getElementById('settings-btn');
const statusDiv = document.getElementById('status');

// Extract button handler
extractBtn.addEventListener('click', async () => {
  try {
    extractBtn.disabled = true;
    statusDiv.textContent = 'Extracting conversation...';

    // Get current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Send message to content script
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: MSG.EXTRACT_CONVERSATION
    });

    if (response.success) {
      statusDiv.textContent = 'Extraction successful!';
    } else {
      statusDiv.textContent = 'Extraction failed: ' + (response.error || 'Unknown error');
    }
  } catch (error) {
    console.error('[GPTCast Popup] Error:', error);
    statusDiv.textContent = 'Error: ' + error.message;
  } finally {
    extractBtn.disabled = false;
  }
});

// Settings button handler (placeholder)
settingsBtn.addEventListener('click', () => {
  console.log('[GPTCast Popup] Settings button clicked (not implemented yet)');
  // TODO: Phase 6 - Open settings page
});

console.log('[GPTCast Popup] Script loaded');
```

**Verify:**
```bash
# Check imports resolve
# Should have no import/export errors
```

**Acceptance:**
- ✓ Imports MSG from message-types.js
- ✓ Extract button sends EXTRACT_CONVERSATION
- ✓ Settings button has placeholder
- ✓ Try-catch error handling present
- ✓ Console log confirms load ✓

---

#### Task 4e: content-script.js (10 min)

**File:** `gptcast-extension/src/content/content-script.js`

**Content:** (Use exact code from phase plan, lines 223-236)

```javascript
import { MSG } from '../shared/message-types.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === MSG.EXTRACT_CONVERSATION) {
    // Implementation in Phase 2
    sendResponse({ success: false, error: 'Not implemented' });
  }
  return true;
});

console.log('[GPTCast] Content script loaded');
```

**Verify:**
```bash
# Check imports resolve
# Should have no import/export errors
```

**Acceptance:**
- ✓ Imports MSG from message-types.js
- ✓ Message listener registered
- ✓ Returns proper response
- ✓ Console log present ✓

---

#### Task 4f: offscreen.html and offscreen.js (10 min)

**File:** `gptcast-extension/src/offscreen/offscreen.html`

**Content:** (Use exact HTML from phase plan, lines 240-247)

```html
<!DOCTYPE html>
<html>
<head>
  <title>GPTCast Audio Processor</title>
</head>
<body>
  <script src="offscreen.js" type="module"></script>
</body>
</html>
```

**File:** `gptcast-extension/src/offscreen/offscreen.js`

**Content:** (Use exact code from phase plan, lines 251-263)

```javascript
import { MSG } from '../shared/message-types.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === MSG.MIX_AUDIO) {
    // Implementation in Phase 5
    sendResponse({ success: false, error: 'Not implemented' });
  }
  return true;
});

console.log('[GPTCast] Offscreen document ready');
```

**Verify:**
```bash
# Check imports resolve
# Should have no import/export errors
```

**Acceptance:**
- ✓ offscreen.html valid structure
- ✓ offscreen.js imports MSG
- ✓ Message listener registered
- ✓ Console log present ✓

---

### Step 5: Load Extension in Chrome (5 min) - TESTING

**Action:**
1. Open Chrome browser
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right)
4. Click "Load unpacked"
5. Select `gptcast-extension/` directory

**Verify in chrome://extensions:**
- ✓ Extension appears in list as "GPTCast"
- ✓ Version shows as "0.1.0"
- ✓ Icon displays in toolbar
- ✓ No error message shown
- ✓ Extension ID assigned (e.g., "abcdefghijklmnopqrstuvwxyz")

**Check Browser Console (F12):**
- ✓ No errors in "Extensions" category
- ✓ Check popup console: Click extension icon → popup.html should open without console errors
- ✓ Check content script: Go to chatgpt.com → should see "[GPTCast] Content script loaded"

**Acceptance:**
- ✓ Extension loads without errors
- ✓ Popup opens cleanly
- ✓ No console errors ✓

---

### Step 6: Test Message Passing (15 min) - VALIDATION

**Test 1: Popup → Service Worker**
1. Open popup (click extension icon)
2. Open DevTools (F12)
3. Go to Sources → select extension background worker
4. Add breakpoint in handleMessage()
5. Click "Extract Conversation" button in popup
6. Should hit breakpoint

**Expected:** Service worker receives message with type: MSG.EXTRACT_CONVERSATION ✓

**Test 2: Popup → Content Script**
1. Navigate to https://chatgpt.com/ (or any ChatGPT page)
2. Open popup again
3. Click "Extract Conversation"
4. Check console for response (in popup console or DevTools)

**Expected:** Content script should respond with success: false, error: 'Not implemented' ✓

**Test 3: Offscreen Document Creation**
1. In service-worker.js, add: `await ensureOffscreenDocument();` to handleMessage()
2. Save and reload extension (chrome://extensions)
3. Click "Extract Conversation" in popup
4. Check chrome://extensions → Details → Manage extensions → check if offscreen document appears

**Expected:** No errors creating offscreen document ✓

**Verify Logs:**
```
[GPTCast Popup] Script loaded
[GPTCast] Content script loaded
[GPTCast] Offscreen document ready
```

**Acceptance:**
- ✓ All message logs appear
- ✓ No console errors
- ✓ Message passing works end-to-end ✓

---

## Commit Strategy

**Commit after each section:**

```bash
# After Step 1-2 (Foundation)
git add gptcast-extension/
git commit -m "feat: create chrome extension scaffold with manifest and message types"

# After Step 3 (Constants & Icons)
git commit -m "feat: add shared constants and placeholder icons"

# After Step 4 (Components)
git commit -m "feat: implement core extension components (popup, service worker, content script, offscreen)"

# After Step 6 (Testing)
git commit -m "test: verify extension loads and message passing works"
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Cannot import module" error | Check file paths in imports, use relative paths from file location |
| Extension won't load in chrome://extensions | Check manifest.json JSON syntax, verify all file paths exist |
| Popup doesn't open | Check manifest.json action.default_popup path |
| Content script not injecting | Check manifest.json host_permissions include the page URL |
| Message not received by service worker | Ensure return true; is present in chrome.runtime.onMessage.addListener |
| Offscreen document fails to create | Check offscreen.html path in chrome.offscreen.createDocument() |

---

## Next Steps (After Phase 1)

- Phase 2: Implement DOM extraction to pull ChatGPT conversation text
- Phase 3: Implement Gemini API script generation
- Phases 4-6: Audio generation, mixing, and UI polish

---

## References

- Full Phase Plan: `D:\www\gptcast\plans\260118-2300-gptcast-chrome-extension\phase-01-extension-scaffold.md`
- Chrome Extension Docs: https://developer.chrome.com/docs/extensions/mv3/
- MV3 Message Passing: https://developer.chrome.com/docs/extensions/mv3/messaging/

