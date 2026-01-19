/**
 * GPTCast Popup Script
 * Handles UI interactions and message passing to service worker
 */
import { MSG } from '../shared/message-types.js';
import { saveApiKey, hasApiKey } from '../shared/storage-utils.js';

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
  const extractBtn = document.getElementById('extract-btn');

  if (!hasKey) {
    hintText.textContent = 'Please configure your API key in Settings first';
    extractBtn.disabled = true;
  } else {
    hintText.textContent = 'Open a ChatGPT conversation first';
    extractBtn.disabled = false;
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
  document.getElementById('back-btn').addEventListener('click', async () => {
    await checkApiKey();
    showView('initial');
  });
}

function setupProgressListener() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === MSG.PROGRESS_UPDATE) {
      updateProgress(message);
    }
    // Return false/undefined for messages we don't handle with sendResponse
    // This signals we won't respond asynchronously
    return false;
  });
}

function showView(viewName) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  views[viewName]?.classList.add('active');
  currentView = viewName;
}

/**
 * Send message with timeout
 */
function sendMessageWithTimeout(tabId, message, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Request timed out'));
    }, timeout);

    chrome.tabs.sendMessage(tabId, message, (response) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
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
    document.getElementById('hint-text').textContent = 'Extracting...';

    const response = await sendMessageWithTimeout(tab.id, {
      type: MSG.EXTRACT_CONVERSATION
    }, 10000);

    if (response && response.success) {
      conversationData = response.data;
      document.getElementById('preview-title').textContent = response.data.title;
      document.getElementById('preview-count').textContent =
        `${response.data.messageCount} messages`;

      // Store and forward to service worker
      await chrome.storage.local.set({ currentConversation: response.data });
      chrome.runtime.sendMessage({
        type: MSG.CONVERSATION_DATA,
        data: response.data
      });

      showView('preview');
    } else {
      showError(response?.error || 'Failed to extract conversation');
    }
  } catch (error) {
    if (error.message.includes('Receiving end does not exist')) {
      showError('Please refresh the ChatGPT page and try again');
    } else if (error.message.includes('timed out')) {
      showError('Extraction timed out. Try refreshing the page.');
    } else {
      showError('Could not connect to ChatGPT page');
    }
  } finally {
    document.getElementById('extract-btn').disabled = false;
    document.getElementById('hint-text').textContent = 'Open a ChatGPT conversation first';
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
  chrome.runtime.sendMessage({ type: MSG.DOWNLOAD_AUDIO });
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
    const response = await chrome.runtime.sendMessage({ type: MSG.TEST_API_KEY });

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

  if (fill) fill.style.width = `${progress}%`;

  const stageNames = {
    starting: 'Starting...',
    script: 'Crafting podcast script...',
    generating: 'Generating...',
    tts: 'Generating audio...',
    loading: 'Loading audio...',
    mixing: 'Mixing tracks...',
    exporting: 'Exporting...',
    complete: 'Complete!'
  };

  if (stageEl) stageEl.textContent = stageNames[stage] || stage;
  if (detailEl) detailEl.textContent = detail || '';
}

function showError(message) {
  document.getElementById('error-message').textContent = message;
  showView('error');
}

console.log('[GPTCast] Popup loaded');
