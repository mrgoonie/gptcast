/**
 * ChatGPT DOM Parser
 * Extracts conversation data from the page with multiple fallback strategies
 */
import { SELECTORS, getMessageRole, shouldExclude } from './selectors.js';

/**
 * Extract complete conversation from current page
 * @returns {Object} Conversation data with title, messages, metadata
 */
export function extractConversation() {
  const messages = [];
  const title = extractTitle();

  // Try primary extraction method first
  const messageElements = document.querySelectorAll(SELECTORS.messageRoles);

  if (messageElements.length === 0) {
    // Use fallback extraction
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
 * Extract conversation title from page
 * @returns {string}
 */
function extractTitle() {
  // Try page title first
  let title = document.title || '';

  // Remove common suffixes
  title = title
    .replace(/\s*[-|]\s*ChatGPT\s*$/i, '')
    .replace(/\s*[-|]\s*OpenAI\s*$/i, '')
    .trim();

  // Fallback: first user message (truncated)
  if (!title || title.toLowerCase() === 'chatgpt' || title.toLowerCase() === 'new chat') {
    const firstUser = document.querySelector(
      `${SELECTORS.messageRoles}[data-message-author-role="user"]`
    );
    if (firstUser) {
      const text = firstUser.textContent || '';
      title = text.slice(0, 60) + (text.length > 60 ? '...' : '');
    }
  }

  return title || 'Untitled Conversation';
}

/**
 * Get unique message ID
 * @param {Element} element
 * @returns {string|null}
 */
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

/**
 * Extract text content from message element
 * @param {Element} element - Message element
 * @param {string} role - 'user' or 'assistant'
 * @returns {string}
 */
function extractContent(element, role) {
  let contentElement;

  if (role === 'assistant') {
    // Assistant content in markdown container
    contentElement = element.querySelector(SELECTORS.assistantContent);
  } else {
    // User content in various possible containers
    contentElement = element.querySelector(SELECTORS.userContent) ||
                     element.querySelector('[class*="user"]') ||
                     element.querySelector('[data-message-content]');
  }

  // Fallback to element itself
  if (!contentElement) {
    contentElement = element;
  }

  return extractTextContent(contentElement);
}

/**
 * Extract text from element, excluding UI elements
 * @param {Element} element
 * @returns {string}
 */
function extractTextContent(element) {
  if (!element) return '';

  // Clone to avoid modifying original
  const clone = element.cloneNode(true);

  // Remove excluded elements
  const excludeSelector = Object.values(SELECTORS.exclude).join(', ');
  clone.querySelectorAll(excludeSelector).forEach(el => el.remove());

  // Extract text, preserving some structure
  let text = '';
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT, null, false);

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;

    // Skip if parent should be excluded
    if (parent && shouldExclude(parent)) continue;

    // Add text with appropriate spacing
    const nodeText = node.textContent || '';
    if (nodeText.trim()) {
      text += nodeText;
    }
  }

  return text;
}

/**
 * Clean extracted text content
 * @param {string} text
 * @returns {string}
 */
function cleanContent(text) {
  if (!text) return '';

  return text
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Trim
    .trim()
    // Remove copy button artifacts
    .replace(/^Copy(code)?/gi, '')
    .replace(/Copy$/gi, '')
    // Normalize quotes
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    // Clean up multiple spaces
    .replace(/  +/g, ' ')
    .trim();
}

/**
 * Fallback extraction for changed DOM structure
 * @returns {Object}
 */
function extractWithFallback() {
  console.warn('[GPTCast] Using fallback extraction method');

  const messages = [];

  // Try testid-based selector
  let turns = document.querySelectorAll(SELECTORS.fallback.turnContainer);

  // Try class-based fallback
  if (turns.length === 0) {
    turns = document.querySelectorAll(SELECTORS.fallback.messages);
  }

  // Last resort: find all potential message containers
  if (turns.length === 0) {
    turns = document.querySelectorAll('[class*="message"], [class*="turn"]');
  }

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
 * Determine message role from content/structure
 * @param {Element} element
 * @returns {string|null}
 */
function determineRoleFromContent(element) {
  // Check data attributes
  const role = getMessageRole(element);
  if (role) return role;

  // Check for user indicators
  const hasUserIndicator = element.querySelector(SELECTORS.fallback.userMessage) ||
                           element.className?.toLowerCase().includes('user');
  if (hasUserIndicator) return 'user';

  // Check for assistant indicators
  const hasAssistantIndicator = element.querySelector(SELECTORS.fallback.assistantMessage) ||
                                 element.querySelector('.markdown') ||
                                 element.className?.toLowerCase().includes('assistant');
  if (hasAssistantIndicator) return 'assistant';

  return null;
}
