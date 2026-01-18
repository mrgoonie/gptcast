/**
 * GPTCast Content Script
 * Runs on ChatGPT pages to extract conversation data
 *
 * IMPORTANT: Chrome MV3 content scripts cannot use ES modules (import/export).
 * The extraction logic from selectors.js and dom-parser.js is duplicated here.
 * If updating DOM logic, ensure both this file and the modules stay in sync.
 * Alternative: Use a bundler (Webpack/Rollup) to combine modules for production.
 */

// Message types
const MSG = {
  EXTRACT_CONVERSATION: 'extract_conversation',
  CONVERSATION_DATA: 'conversation_data'
};

// DOM Selectors
const SELECTORS = {
  messageRoles: '[data-message-author-role]',
  messageId: '[data-message-id]',
  assistantContent: '.markdown',
  userContent: '.whitespace-pre-wrap',
  fallback: {
    messages: '[class*="agent-turn"], [class*="human-turn"]',
    userMessage: '[class*="user"], [class*="human"]',
    assistantMessage: '[class*="assistant"], [class*="agent"], [class*="gpt"]',
    turnContainer: '[data-testid="conversation-turn"]'
  },
  exclude: {
    codeToolbar: '.code-toolbar, [class*="code-toolbar"]',
    copyButton: '[class*="copy"], button[aria-label*="Copy"]',
    actionButtons: '[class*="action"], [class*="btn"]',
    metadata: '[class*="timestamp"], [class*="avatar"]'
  }
};

/**
 * Get message role from element
 */
function getMessageRole(element) {
  const role = element.getAttribute('data-message-author-role');
  if (role) return role;

  const classes = (element.className || '').toLowerCase();
  if (classes.includes('user') || classes.includes('human')) return 'user';
  if (classes.includes('assistant') || classes.includes('agent') || classes.includes('gpt')) return 'assistant';

  const parent = element.closest('[data-message-author-role]');
  if (parent) return parent.getAttribute('data-message-author-role');

  return null;
}

/**
 * Check if element should be excluded
 */
function shouldExclude(element) {
  const excludeSelector = Object.values(SELECTORS.exclude).join(', ');
  return element.matches && (element.matches(excludeSelector) || element.closest(excludeSelector));
}

/**
 * Extract conversation title
 */
function extractTitle() {
  let title = document.title || '';
  title = title.replace(/\s*[-|]\s*ChatGPT\s*$/i, '').replace(/\s*[-|]\s*OpenAI\s*$/i, '').trim();

  if (!title || title.toLowerCase() === 'chatgpt' || title.toLowerCase() === 'new chat') {
    const firstUser = document.querySelector(`${SELECTORS.messageRoles}[data-message-author-role="user"]`);
    if (firstUser) {
      const text = firstUser.textContent || '';
      title = text.slice(0, 60) + (text.length > 60 ? '...' : '');
    }
  }

  return title || 'Untitled Conversation';
}

/**
 * Get message ID
 */
function getMessageId(element) {
  let id = element.getAttribute('data-message-id');
  if (id) return id;

  const container = element.closest(SELECTORS.messageId);
  return container ? container.getAttribute('data-message-id') : null;
}

/**
 * Extract text content from element
 */
function extractTextContent(element) {
  if (!element) return '';

  const clone = element.cloneNode(true);
  const excludeSelector = Object.values(SELECTORS.exclude).join(', ');
  clone.querySelectorAll(excludeSelector).forEach(el => el.remove());

  let text = '';
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT, null, false);

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    if (parent && shouldExclude(parent)) continue;

    const nodeText = node.textContent || '';
    if (nodeText.trim()) {
      text += nodeText;
    }
  }

  return text;
}

/**
 * Extract content from message element
 */
function extractContent(element, role) {
  let contentElement;

  if (role === 'assistant') {
    contentElement = element.querySelector(SELECTORS.assistantContent);
  } else {
    contentElement = element.querySelector(SELECTORS.userContent) ||
                     element.querySelector('[class*="user"]') ||
                     element.querySelector('[data-message-content]');
  }

  if (!contentElement) contentElement = element;
  return extractTextContent(contentElement);
}

/**
 * Clean extracted text
 */
function cleanContent(text) {
  if (!text) return '';
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^Copy(code)?/gi, '')
    .replace(/Copy$/gi, '')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/  +/g, ' ')
    .trim();
}

/**
 * Determine role from content
 */
function determineRoleFromContent(element) {
  const role = getMessageRole(element);
  if (role) return role;

  const hasUserIndicator = element.querySelector(SELECTORS.fallback.userMessage) ||
                           element.className?.toLowerCase().includes('user');
  if (hasUserIndicator) return 'user';

  const hasAssistantIndicator = element.querySelector(SELECTORS.fallback.assistantMessage) ||
                                 element.querySelector('.markdown') ||
                                 element.className?.toLowerCase().includes('assistant');
  if (hasAssistantIndicator) return 'assistant';

  return null;
}

/**
 * Fallback extraction
 */
function extractWithFallback() {
  console.warn('[GPTCast] Using fallback extraction method');
  const messages = [];

  let turns = document.querySelectorAll(SELECTORS.fallback.turnContainer);
  if (turns.length === 0) turns = document.querySelectorAll(SELECTORS.fallback.messages);
  if (turns.length === 0) turns = document.querySelectorAll('[class*="message"], [class*="turn"]');

  turns.forEach((turn, index) => {
    const role = determineRoleFromContent(turn);
    const content = extractTextContent(turn);

    if (content && content.trim() && role) {
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

/**
 * Main extraction function
 */
function extractConversation() {
  const messages = [];
  const title = extractTitle();

  const messageElements = document.querySelectorAll(SELECTORS.messageRoles);

  if (messageElements.length === 0) {
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
        timestamp: index
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

/**
 * Message handler
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === MSG.EXTRACT_CONVERSATION) {
    try {
      const conversation = extractConversation();

      // Filter out whitespace-only messages
      conversation.messages = conversation.messages.filter(m =>
        m.content && m.content.trim().length > 0
      );
      conversation.messageCount = conversation.messages.length;

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

/**
 * Verify we're on ChatGPT
 */
function isOnChatGPT() {
  return window.location.hostname.includes('chatgpt.com') ||
         window.location.hostname.includes('chat.openai.com');
}

// Initialize
if (isOnChatGPT()) {
  console.log('[GPTCast] Content script loaded on ChatGPT');
}
