# Phase 6: UI Polish

## Context Links
- [Brainstorm - UX Flow](../reports/brainstorm-260118-2247-gptcast-chrome-extension.md)
- [Phase 1 - Extension Scaffold](./phase-01-extension-scaffold.md)
- [All Previous Phases](./plan.md)

## Overview
- **Priority**: P1 (Polish)
- **Status**: pending
- **Effort**: 2h
- **Description**: Create polished popup UI with settings, progress indicators, and error handling

## Key Insights

### User Flow
1. Click extension icon on ChatGPT page
2. See conversation preview (title, message count)
3. Configure settings (voice, music mood)
4. Click "Generate Podcast"
5. Watch progress indicators
6. Download when complete

### Settings Requirements
- API key input (stored encrypted)
- Voice selection (5 options)
- Music mood selection (4 options including "none")
- Condensed mode toggle for long conversations

### Progress Stages
1. "Extracting conversation..." (instant)
2. "Crafting podcast script..." (5-30s)
3. "Generating audio..." (10-60s)
4. "Mixing tracks..." (5-30s)
5. "Download ready!" (complete)

## Requirements

### Functional
- Settings panel with API key management
- Voice selection dropdown
- Music mood selection
- Progress bar with stage descriptions
- Error display with retry option
- Conversation preview before generation

### Non-Functional
- Responsive popup (400x500px max)
- Accessible (keyboard navigation, ARIA labels)
- Clear visual feedback for all states
- No layout shifts during state changes

## Architecture

```
Popup States
├── Initial (Ready)
│   ├── Logo/Title
│   ├── [Extract Conversation] button
│   └── [Settings] icon
│
├── Preview
│   ├── Conversation title
│   ├── Message count
│   ├── Voice selector
│   ├── Music mood selector
│   ├── [Generate Podcast] button
│   └── [Cancel] link
│
├── Processing
│   ├── Progress bar
│   ├── Stage description
│   ├── Cancel button
│   └── (animated indicator)
│
├── Complete
│   ├── Success message
│   ├── [Download Again] button
│   └── [Start Over] button
│
├── Error
│   ├── Error message
│   ├── [Retry] button
│   └── [Start Over] button
│
└── Settings
    ├── API Key input (masked)
    ├── [Save] button
    ├── [Test API] button
    └── [Back] link
```

## Related Code Files

### Modify
- `src/popup/popup.html` - Complete UI structure
- `src/popup/popup.css` - Full styling
- `src/popup/popup.js` - State management and handlers

### Create
- `src/popup/settings-panel.js` - Settings logic
- `src/shared/storage-utils.js` - Encrypted storage helpers

## Implementation Steps

### 1. Create storage utilities with encryption
```javascript
// src/shared/storage-utils.js
const ENCRYPTION_KEY_NAME = 'gptcast-encryption-key';

// Generate or retrieve encryption key
async function getEncryptionKey() {
  const stored = await chrome.storage.local.get(ENCRYPTION_KEY_NAME);

  if (stored[ENCRYPTION_KEY_NAME]) {
    const keyData = new Uint8Array(stored[ENCRYPTION_KEY_NAME]);
    return crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // Generate new key
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const exported = await crypto.subtle.exportKey('raw', key);
  await chrome.storage.local.set({
    [ENCRYPTION_KEY_NAME]: Array.from(new Uint8Array(exported))
  });

  return key;
}

export async function saveApiKey(apiKey) {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(apiKey)
  );

  await chrome.storage.local.set({
    apiKey: {
      data: Array.from(new Uint8Array(encrypted)),
      iv: Array.from(iv)
    }
  });
}

export async function getApiKey() {
  const stored = await chrome.storage.local.get('apiKey');
  if (!stored.apiKey) return null;

  try {
    const key = await getEncryptionKey();
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(stored.apiKey.iv) },
      key,
      new Uint8Array(stored.apiKey.data)
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

export async function clearApiKey() {
  await chrome.storage.local.remove('apiKey');
}

export async function hasApiKey() {
  const stored = await chrome.storage.local.get('apiKey');
  return !!stored.apiKey;
}
```

### 2. Update popup.html
```html
<!-- src/popup/popup.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="popup.css">
  <title>GPTCast</title>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <header class="header">
      <div class="logo">
        <img src="../../assets/icons/icon-32.png" alt="" class="logo-icon">
        <h1>GPTCast</h1>
      </div>
      <button id="settings-btn" class="icon-btn" title="Settings" aria-label="Settings">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
    </header>

    <!-- Main Content Area -->
    <main class="main">
      <!-- Initial State -->
      <section id="view-initial" class="view active">
        <p class="subtitle">Transform ChatGPT conversations into podcast audio</p>
        <button id="extract-btn" class="btn btn-primary">
          Extract Conversation
        </button>
        <p class="hint" id="hint-text">Open a ChatGPT conversation first</p>
      </section>

      <!-- Preview State -->
      <section id="view-preview" class="view">
        <div class="preview-card">
          <h2 id="preview-title" class="preview-title">Conversation Title</h2>
          <p id="preview-count" class="preview-meta">0 messages</p>
        </div>

        <div class="form-group">
          <label for="voice-select">Voice</label>
          <select id="voice-select" class="select">
            <option value="Puck">Puck (Upbeat)</option>
            <option value="Kore">Kore (Firm)</option>
            <option value="Charon">Charon (Warm)</option>
            <option value="Fenrir">Fenrir (Deep)</option>
            <option value="Aoede">Aoede (Bright)</option>
          </select>
        </div>

        <div class="form-group">
          <label for="music-select">Background Music</label>
          <select id="music-select" class="select">
            <option value="calm">Calm</option>
            <option value="upbeat">Upbeat</option>
            <option value="ambient">Ambient</option>
            <option value="none">No Music</option>
          </select>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" id="condensed-check">
            <span>Condensed mode (shorter output)</span>
          </label>
        </div>

        <button id="generate-btn" class="btn btn-primary">
          Generate Podcast
        </button>
        <button id="cancel-preview-btn" class="btn btn-text">Cancel</button>
      </section>

      <!-- Processing State -->
      <section id="view-processing" class="view">
        <div class="progress-container">
          <div class="progress-bar">
            <div id="progress-fill" class="progress-fill" style="width: 0%"></div>
          </div>
          <p id="progress-stage" class="progress-stage">Preparing...</p>
          <p id="progress-detail" class="progress-detail"></p>
        </div>
        <div class="spinner"></div>
        <button id="cancel-processing-btn" class="btn btn-text">Cancel</button>
      </section>

      <!-- Complete State -->
      <section id="view-complete" class="view">
        <div class="success-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9 12l2 2 4-4"/>
          </svg>
        </div>
        <h2>Podcast Ready!</h2>
        <p class="success-meta" id="success-meta">Download should start automatically</p>
        <button id="download-again-btn" class="btn btn-secondary">Download Again</button>
        <button id="start-over-btn" class="btn btn-text">Create Another</button>
      </section>

      <!-- Error State -->
      <section id="view-error" class="view">
        <div class="error-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h2>Something went wrong</h2>
        <p class="error-message" id="error-message">Unknown error occurred</p>
        <button id="retry-btn" class="btn btn-secondary">Try Again</button>
        <button id="error-start-over-btn" class="btn btn-text">Start Over</button>
      </section>

      <!-- Settings State -->
      <section id="view-settings" class="view">
        <h2>Settings</h2>

        <div class="form-group">
          <label for="api-key-input">Gemini API Key</label>
          <div class="input-group">
            <input type="password" id="api-key-input" class="input" placeholder="Enter your API key">
            <button id="toggle-key-btn" class="icon-btn" title="Show/Hide" aria-label="Toggle visibility">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
          </div>
          <p class="hint">Get your key from <a href="https://aistudio.google.com/apikey" target="_blank">AI Studio</a></p>
        </div>

        <div class="btn-group">
          <button id="save-key-btn" class="btn btn-primary">Save Key</button>
          <button id="test-key-btn" class="btn btn-secondary">Test API</button>
        </div>

        <p id="settings-status" class="status-text"></p>

        <button id="back-btn" class="btn btn-text">Back</button>
      </section>
    </main>
  </div>

  <script src="popup.js" type="module"></script>
</body>
</html>
```

### 3. Create popup.css
```css
/* src/popup/popup.css */
:root {
  --primary: #6366f1;
  --primary-hover: #4f46e5;
  --success: #10b981;
  --error: #ef4444;
  --bg: #ffffff;
  --bg-secondary: #f9fafb;
  --text: #111827;
  --text-secondary: #6b7280;
  --border: #e5e7eb;
  --radius: 8px;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  color: var(--text);
  background: var(--bg);
  width: 360px;
  min-height: 400px;
}

.container {
  padding: 16px;
}

/* Header */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-icon {
  width: 28px;
  height: 28px;
}

.logo h1 {
  font-size: 20px;
  font-weight: 600;
}

.icon-btn {
  background: none;
  border: none;
  padding: 8px;
  cursor: pointer;
  color: var(--text-secondary);
  border-radius: var(--radius);
  transition: background-color 0.2s, color 0.2s;
}

.icon-btn:hover {
  background: var(--bg-secondary);
  color: var(--text);
}

/* Views */
.view {
  display: none;
}

.view.active {
  display: block;
}

.subtitle {
  color: var(--text-secondary);
  margin-bottom: 20px;
  text-align: center;
}

.hint {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 12px;
  text-align: center;
}

.hint a {
  color: var(--primary);
  text-decoration: none;
}

.hint a:hover {
  text-decoration: underline;
}

/* Buttons */
.btn {
  display: block;
  width: 100%;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
  transition: background-color 0.2s, opacity 0.2s;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--primary);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-hover);
}

.btn-secondary {
  background: var(--bg-secondary);
  color: var(--text);
  border: 1px solid var(--border);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--border);
}

.btn-text {
  background: none;
  color: var(--text-secondary);
}

.btn-text:hover:not(:disabled) {
  color: var(--text);
}

.btn-group {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.btn-group .btn {
  flex: 1;
}

/* Form elements */
.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 6px;
  color: var(--text);
}

.select,
.input {
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--text);
}

.select:focus,
.input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.input-group {
  display: flex;
  gap: 8px;
}

.input-group .input {
  flex: 1;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
}

.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--primary);
}

/* Preview card */
.preview-card {
  background: var(--bg-secondary);
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 20px;
}

.preview-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-meta {
  font-size: 13px;
  color: var(--text-secondary);
}

/* Progress */
.progress-container {
  margin-bottom: 24px;
}

.progress-bar {
  height: 6px;
  background: var(--bg-secondary);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 12px;
}

.progress-fill {
  height: 100%;
  background: var(--primary);
  transition: width 0.3s ease;
}

.progress-stage {
  font-weight: 500;
  text-align: center;
  margin-bottom: 4px;
}

.progress-detail {
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  margin: 0 auto 16px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Success/Error states */
.success-icon,
.error-icon {
  text-align: center;
  margin-bottom: 16px;
}

.success-icon svg {
  color: var(--success);
}

.error-icon svg {
  color: var(--error);
}

#view-complete h2,
#view-error h2 {
  text-align: center;
  margin-bottom: 8px;
}

.success-meta,
.error-message {
  text-align: center;
  color: var(--text-secondary);
  margin-bottom: 20px;
  font-size: 13px;
}

.error-message {
  color: var(--error);
}

/* Settings */
#view-settings h2 {
  margin-bottom: 20px;
}

.status-text {
  font-size: 13px;
  text-align: center;
  margin: 12px 0;
}

.status-text.success {
  color: var(--success);
}

.status-text.error {
  color: var(--error);
}
```

### 4. Update popup.js with state management
```javascript
// src/popup/popup.js
import { MSG } from '../shared/message-types.js';
import { saveApiKey, getApiKey, hasApiKey } from '../shared/storage-utils.js';

// State
let currentView = 'initial';
let conversationData = null;
let isProcessing = false;

// DOM Elements
const views = {
  initial: document.getElementById('view-initial'),
  preview: document.getElementById('view-preview'),
  processing: document.getElementById('view-processing'),
  complete: document.getElementById('view-complete'),
  error: document.getElementById('view-error'),
  settings: document.getElementById('view-settings')
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await checkApiKey();
  setupEventListeners();
  setupProgressListener();
});

async function checkApiKey() {
  const hasKey = await hasApiKey();
  const hintText = document.getElementById('hint-text');

  if (!hasKey) {
    hintText.textContent = 'Please configure your API key in Settings first';
    document.getElementById('extract-btn').disabled = true;
  } else {
    hintText.textContent = 'Open a ChatGPT conversation first';
    document.getElementById('extract-btn').disabled = false;
  }
}

function setupEventListeners() {
  // Initial view
  document.getElementById('extract-btn').addEventListener('click', handleExtract);
  document.getElementById('settings-btn').addEventListener('click', () => showView('settings'));

  // Preview view
  document.getElementById('generate-btn').addEventListener('click', handleGenerate);
  document.getElementById('cancel-preview-btn').addEventListener('click', () => showView('initial'));

  // Processing view
  document.getElementById('cancel-processing-btn').addEventListener('click', handleCancel);

  // Complete view
  document.getElementById('download-again-btn').addEventListener('click', handleDownloadAgain);
  document.getElementById('start-over-btn').addEventListener('click', handleStartOver);

  // Error view
  document.getElementById('retry-btn').addEventListener('click', handleGenerate);
  document.getElementById('error-start-over-btn').addEventListener('click', handleStartOver);

  // Settings view
  document.getElementById('save-key-btn').addEventListener('click', handleSaveKey);
  document.getElementById('test-key-btn').addEventListener('click', handleTestKey);
  document.getElementById('toggle-key-btn').addEventListener('click', handleToggleKeyVisibility);
  document.getElementById('back-btn').addEventListener('click', () => {
    checkApiKey();
    showView('initial');
  });
}

function setupProgressListener() {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === MSG.PROGRESS_UPDATE) {
      updateProgress(message);
    }
  });
}

function showView(viewName) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  views[viewName].classList.add('active');
  currentView = viewName;
}

// Handlers
async function handleExtract() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab.url?.includes('chatgpt.com') && !tab.url?.includes('chat.openai.com')) {
    showError('Please open a ChatGPT conversation first');
    return;
  }

  try {
    document.getElementById('extract-btn').disabled = true;

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: MSG.EXTRACT_CONVERSATION
    });

    if (response.success) {
      conversationData = response.data;
      document.getElementById('preview-title').textContent = response.data.title;
      document.getElementById('preview-count').textContent =
        `${response.data.messageCount} messages`;
      showView('preview');
    } else {
      showError(response.error || 'Failed to extract conversation');
    }
  } catch (error) {
    showError('Could not connect to ChatGPT page. Please refresh the page and try again.');
  } finally {
    document.getElementById('extract-btn').disabled = false;
  }
}

async function handleGenerate() {
  if (isProcessing) return;
  isProcessing = true;

  showView('processing');
  updateProgress({ stage: 'starting', progress: 0, detail: 'Initializing...' });

  try {
    const voice = document.getElementById('voice-select').value;
    const musicMood = document.getElementById('music-select').value;
    const condensed = document.getElementById('condensed-check').checked;

    // Step 1: Generate script
    updateProgress({ stage: 'script', progress: 10, detail: 'Crafting podcast script...' });
    const scriptResponse = await chrome.runtime.sendMessage({
      type: MSG.GENERATE_SCRIPT,
      condensed
    });

    if (!scriptResponse.success) {
      throw new Error(scriptResponse.error || 'Script generation failed');
    }

    // Step 2: Generate TTS
    updateProgress({ stage: 'tts', progress: 30, detail: 'Generating audio...' });
    const ttsResponse = await chrome.runtime.sendMessage({
      type: MSG.GENERATE_TTS,
      voice
    });

    if (!ttsResponse.success) {
      throw new Error(ttsResponse.error || 'Audio generation failed');
    }

    // Step 3: Mix and download
    updateProgress({ stage: 'mixing', progress: 70, detail: 'Mixing tracks...' });
    const mixResponse = await chrome.runtime.sendMessage({
      type: MSG.GENERATE_PODCAST,
      musicMood
    });

    if (!mixResponse.success) {
      throw new Error(mixResponse.error || 'Mixing failed');
    }

    updateProgress({ stage: 'complete', progress: 100, detail: 'Done!' });
    showView('complete');

  } catch (error) {
    showError(error.message);
  } finally {
    isProcessing = false;
  }
}

function handleCancel() {
  isProcessing = false;
  showView('preview');
}

function handleDownloadAgain() {
  chrome.runtime.sendMessage({ type: MSG.DOWNLOAD_AGAIN });
}

function handleStartOver() {
  conversationData = null;
  showView('initial');
}

async function handleSaveKey() {
  const input = document.getElementById('api-key-input');
  const status = document.getElementById('settings-status');
  const key = input.value.trim();

  if (!key) {
    status.textContent = 'Please enter an API key';
    status.className = 'status-text error';
    return;
  }

  try {
    await saveApiKey(key);
    status.textContent = 'API key saved successfully';
    status.className = 'status-text success';
    input.value = '';
  } catch (error) {
    status.textContent = 'Failed to save API key';
    status.className = 'status-text error';
  }
}

async function handleTestKey() {
  const status = document.getElementById('settings-status');
  status.textContent = 'Testing API key...';
  status.className = 'status-text';

  try {
    const response = await chrome.runtime.sendMessage({ type: 'TEST_API_KEY' });

    if (response.success) {
      status.textContent = 'API key is valid!';
      status.className = 'status-text success';
    } else {
      status.textContent = response.error || 'Invalid API key';
      status.className = 'status-text error';
    }
  } catch (error) {
    status.textContent = 'Test failed: ' + error.message;
    status.className = 'status-text error';
  }
}

function handleToggleKeyVisibility() {
  const input = document.getElementById('api-key-input');
  input.type = input.type === 'password' ? 'text' : 'password';
}

function updateProgress({ stage, progress, detail }) {
  const fill = document.getElementById('progress-fill');
  const stageEl = document.getElementById('progress-stage');
  const detailEl = document.getElementById('progress-detail');

  fill.style.width = `${progress}%`;

  const stageNames = {
    starting: 'Starting...',
    script: 'Crafting podcast script...',
    tts: 'Generating audio...',
    mixing: 'Mixing tracks...',
    complete: 'Complete!'
  };

  stageEl.textContent = stageNames[stage] || stage;
  detailEl.textContent = detail || '';
}

function showError(message) {
  document.getElementById('error-message').textContent = message;
  showView('error');
}
```

## Todo Checklist

- [ ] Create storage-utils.js with encrypted API key storage
- [ ] Update popup.html with complete UI structure
- [ ] Create popup.css with all styling
- [ ] Update popup.js with state management
- [ ] Implement all view transitions
- [ ] Implement progress bar updates
- [ ] Implement settings panel
- [ ] Add API key encryption/decryption
- [ ] Add API key test functionality
- [ ] Test all UI states
- [ ] Test error handling display
- [ ] Verify keyboard accessibility
- [ ] Test on different popup sizes

## Success Criteria

1. All UI states render correctly
2. Progress bar updates smoothly during generation
3. API key stored securely (encrypted)
4. Settings persist across sessions
5. Error messages are clear and actionable
6. UI is responsive and accessible

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| State management bugs | Medium | Careful state isolation |
| Encryption key loss | Medium | Key stored alongside encrypted data |
| Popup closes during processing | Low | Processing continues in service worker |

## Security Considerations

- API key encrypted with AES-GCM before storage
- Encryption key generated per-installation
- Password input masked by default
- No plaintext secrets in storage

## Next Steps

After this phase:
- Test full end-to-end workflow
- Bug fixes and polish
- Chrome Web Store submission preparation
- Documentation and README
