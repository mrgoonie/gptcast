# Phase 2: DOM Extraction

## Context Links
- [Brainstorm - DOM Structure](../reports/brainstorm-260118-2247-gptcast-chrome-extension.md)
- [TTS Research - DOM Parsing](../reports/researcher-260118-2247-chatgpt-to-podcast-tts-audio-research.md)
- [Phase 1 - Extension Scaffold](./phase-01-extension-scaffold.md)

## Overview
- **Priority**: P0 (Core functionality)
- **Status**: completed
- **Effort**: 2h
- **Completed**: 2026-01-18T23:47:00Z
- **Review**: [Code Review Report](../reports/code-reviewer-260118-2343-phase2-dom-extraction.md)
- **Description**: Extract conversation data from ChatGPT page DOM with reliable selectors and fallback strategies

## Key Insights

### Verified ChatGPT DOM Selectors
```javascript
// Primary selectors (verified Jan 2026)
document.querySelectorAll('[data-message-author-role]')  // "user" | "assistant"
element.closest('[data-message-id]')                     // Unique message ID
element.querySelector('.markdown')                       // Assistant content
element.querySelector('.user-message-bubble-color')      // User content
document.title                                           // Conversation title
```

### DOM Characteristics
- Messages use `data-message-author-role` attribute (user/assistant)
- Each message has unique `data-message-id`
- Assistant responses in `.markdown` containers
- User messages in `.user-message-bubble-color` bubbles
- Turn-based structure with `.agent-turn` class

### Risk Mitigation
- OpenAI may change DOM structure without notice
- Implement multiple fallback selectors
- Feature detection over hardcoded selectors
- Graceful degradation if extraction fails

## Requirements

### Functional
- Extract all user messages from conversation
- Extract all assistant messages from conversation
- Preserve message order (chronological)
- Capture conversation title
- Handle code blocks, lists, formatting

### Non-Functional
- Extraction completes in <500ms for 100 messages
- Resilient to minor DOM changes
- Clear error messages if extraction fails
- No data leaves content script context without user action

## Architecture

```
ChatGPT Page DOM
       │
       ▼
Content Script (content-script.js)
├── DOMParser module
│   ├── extractMessages()
│   ├── parseUserMessage()
│   ├── parseAssistantMessage()
│   └── cleanContent()
└── Message passing to Service Worker
```

## Related Code Files

### Create
- `src/content/dom-parser.js` - DOM parsing logic
- `src/content/selectors.js` - Selector definitions with fallbacks

### Modify
- `src/content/content-script.js` - Add extraction handler

## Implementation Steps

### 1. Create selectors.js with fallback patterns
```javascript
// src/content/selectors.js
export const SELECTORS = {
  // Primary selectors (most reliable)
  messageRoles: '[data-message-author-role]',
  messageId: '[data-message-id]',
  assistantContent: '.markdown',
  userContent: '.user-message-bubble-color',

  // Fallback selectors
  fallback: {
    messages: '[class*="agent-turn"], [class*="human-turn"]',
    userMessage: '[class*="user"], [class*="human"]',
    assistantMessage: '[class*="assistant"], [class*="agent"]'
  },

  // Exclusions (elements to skip)
  exclude: {
    codeToolbar: '.code-toolbar',
    copyButton: '[class*="copy"]',
    actionButtons: '[class*="action"]'
  }
};

export function getMessageRole(element) {
  // Primary method
  const role = element.getAttribute('data-message-author-role');
  if (role) return role;

  // Fallback: class-based detection
  const classes = element.className || '';
  if (classes.includes('user') || classes.includes('human')) return 'user';
  if (classes.includes('assistant') || classes.includes('agent')) return 'assistant';

  return null;
}
```

### 2. Create dom-parser.js module
```javascript
// src/content/dom-parser.js
import { SELECTORS, getMessageRole } from './selectors.js';

export function extractConversation() {
  const messages = [];
  const title = extractTitle();

  // Find all message elements
  const messageElements = document.querySelectorAll(SELECTORS.messageRoles);

  if (messageElements.length === 0) {
    // Try fallback selectors
    return extractWithFallback();
  }

  messageElements.forEach((element, index) => {
    const role = getMessageRole(element);
    if (!role) return;

    const messageId = getMessageId(element);
    const content = extractContent(element, role);

    if (content && content.trim()) {
      messages.push({
        id: messageId || `msg-${index}`,
        role,
        content: cleanContent(content),
        timestamp: index // Order indicator
      });
    }
  });

  return {
    title,
    messages,
    extractedAt: new Date().toISOString(),
    url: window.location.href,
    messageCount: messages.length
  };
}

function extractTitle() {
  // Try page title first
  let title = document.title || '';

  // Remove "ChatGPT" suffix if present
  title = title.replace(/\s*[-|]\s*ChatGPT\s*$/i, '').trim();

  // Fallback: first user message (truncated)
  if (!title || title === 'ChatGPT') {
    const firstUser = document.querySelector(
      `${SELECTORS.messageRoles}[data-message-author-role="user"]`
    );
    if (firstUser) {
      const text = firstUser.textContent || '';
      title = text.slice(0, 50) + (text.length > 50 ? '...' : '');
    }
  }

  return title || 'Untitled Conversation';
}

function getMessageId(element) {
  // Check element itself
  let id = element.getAttribute('data-message-id');
  if (id) return id;

  // Check parent/ancestor
  const messageContainer = element.closest(SELECTORS.messageId);
  if (messageContainer) {
    return messageContainer.getAttribute('data-message-id');
  }

  return null;
}

function extractContent(element, role) {
  let contentElement;

  if (role === 'assistant') {
    // Assistant content is in markdown container
    contentElement = element.querySelector(SELECTORS.assistantContent);
  } else {
    // User content in bubble
    contentElement = element.querySelector(SELECTORS.userContent);
  }

  // Fallback to element itself
  if (!contentElement) {
    contentElement = element;
  }

  return contentElement ? contentElement.textContent : '';
}

function cleanContent(text) {
  if (!text) return '';

  return text
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Remove leading/trailing whitespace
    .trim()
    // Remove copy button artifacts
    .replace(/^Copy(code)?/gi, '')
    // Normalize quotes
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'");
}

function extractWithFallback() {
  console.warn('[GPTCast] Using fallback extraction method');

  // Fallback implementation for changed DOM
  const messages = [];
  const turns = document.querySelectorAll(SELECTORS.fallback.messages);

  turns.forEach((turn, index) => {
    const isUser = turn.querySelector(SELECTORS.fallback.userMessage);
    const role = isUser ? 'user' : 'assistant';
    const content = turn.textContent || '';

    if (content.trim()) {
      messages.push({
        id: `fallback-${index}`,
        role,
        content: cleanContent(content),
        timestamp: index
      });
    }
  });

  return {
    title: extractTitle(),
    messages,
    extractedAt: new Date().toISOString(),
    url: window.location.href,
    messageCount: messages.length,
    usedFallback: true
  };
}
```

### 3. Update content-script.js
```javascript
// src/content/content-script.js
import { MSG } from '../shared/message-types.js';
import { extractConversation } from './dom-parser.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === MSG.EXTRACT_CONVERSATION) {
    try {
      const conversation = extractConversation();

      if (conversation.messages.length === 0) {
        sendResponse({
          success: false,
          error: 'No messages found. Are you on a ChatGPT conversation page?'
        });
        return true;
      }

      sendResponse({
        success: true,
        data: conversation
      });
    } catch (error) {
      console.error('[GPTCast] Extraction error:', error);
      sendResponse({
        success: false,
        error: `Extraction failed: ${error.message}`
      });
    }
  }
  return true;
});

// Verify we're on ChatGPT
function isOnChatGPT() {
  return window.location.hostname.includes('chatgpt.com') ||
         window.location.hostname.includes('chat.openai.com');
}

if (isOnChatGPT()) {
  console.log('[GPTCast] Content script loaded on ChatGPT');
}
```

### 4. Update popup.js to trigger extraction
```javascript
// src/popup/popup.js
import { MSG } from '../shared/message-types.js';

const extractBtn = document.getElementById('extract-btn');
const statusEl = document.getElementById('status');

extractBtn.addEventListener('click', async () => {
  statusEl.textContent = 'Extracting conversation...';
  extractBtn.disabled = true;

  try {
    // Get active tab
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    // Verify we're on ChatGPT
    if (!tab.url?.includes('chatgpt.com') && !tab.url?.includes('chat.openai.com')) {
      statusEl.textContent = 'Please open a ChatGPT conversation first';
      extractBtn.disabled = false;
      return;
    }

    // Send extraction request to content script
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: MSG.EXTRACT_CONVERSATION
    });

    if (response.success) {
      statusEl.textContent = `Found ${response.data.messageCount} messages`;
      // Store for next phase
      await chrome.storage.local.set({
        currentConversation: response.data
      });

      // Forward to service worker
      chrome.runtime.sendMessage({
        type: MSG.CONVERSATION_DATA,
        data: response.data
      });
    } else {
      statusEl.textContent = response.error || 'Extraction failed';
    }
  } catch (error) {
    console.error('[GPTCast] Error:', error);
    statusEl.textContent = 'Error: Could not extract conversation';
  }

  extractBtn.disabled = false;
});
```

## Todo Checklist

- [x] Create selectors.js with primary and fallback selectors (2026-01-18)
- [x] Create dom-parser.js with extraction logic (2026-01-18)
- [x] Implement extractConversation() function (2026-01-18)
- [x] Implement cleanContent() for text normalization (2026-01-18)
- [x] Implement fallback extraction method (2026-01-18)
- [x] Update content-script.js to handle extraction (2026-01-18)
- [x] Update popup.js to trigger extraction (2026-01-18)
- [ ] Test on multiple ChatGPT conversation types
- [ ] Test with code blocks and markdown formatting
- [ ] Test fallback selectors
- [ ] **[PRIORITY]** Handle edge cases (empty/whitespace-only messages) - See code review Warning #3
- [ ] **[OPTIONAL]** Document MV3 code duplication rationale in content-script.js - See code review Warning #1

## Success Criteria

1. Extract conversation with >95% accuracy on standard ChatGPT pages
2. Preserve message order correctly
3. Handle conversations with 50+ messages
4. Clean extraction of code blocks and formatted text
5. Graceful failure with helpful error messages
6. Fallback method works if primary selectors fail

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| DOM structure changes | High | Multiple fallback selectors, feature detection |
| Very long conversations | Medium | Pagination awareness, chunk extraction |
| Dynamic loading (lazy load) | Medium | Wait for DOM stability, mutation observer |
| Code block formatting loss | Low | Preserve newlines in code contexts |

## Security Considerations

- Content script runs in isolated context (cannot access page JS)
- No eval() or innerHTML with user content
- Sanitize extracted text before passing to service worker
- No external network requests from content script

## Next Steps

After this phase:
- Phase 3: Transform extracted conversation into podcast script
- Conversation data will be passed to Gemini LLM for script generation
- Need to handle token limits for long conversations
